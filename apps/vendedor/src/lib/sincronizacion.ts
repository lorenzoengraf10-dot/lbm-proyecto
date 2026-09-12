"use client";

import { ordenarPorCodigo } from "@lbm/shared";
import { crearClienteNavegador } from "./supabase-browser";
import {
  encolar,
  encolarEstado,
  guardarCatalogo,
  guardarPerfil,
  guardarUltimosPedidos,
  leerCola,
  leerColaEstados,
  quitarDeCola,
  quitarEstadoDeCola,
  type CambioEstadoPendiente,
  type PendienteCola,
} from "./almacen-local";

/** Qué pasó con lo que el vendedor acaba de cargar. */
export type ResultadoCarga =
  | { estado: "subido" }
  | { estado: "en-cola" }
  | { estado: "rechazado"; motivo: string };

/**
 * Todo lo que el vendedor carga pasa primero por la cola local y recién
 * después sube. Con señal la subida tarda un parpadeo; sin señal queda
 * esperando y se reintenta sola. Es un solo camino para los dos casos, en vez
 * de un "modo offline" aparte que se prueba poco y se rompe callado.
 *
 * Devuelve qué pasó con ESTA carga (no con toda la cola): antes avisaba
 * "Pedido cargado" incluso cuando el servidor lo había rechazado, y el
 * vendedor se iba del comercio creyendo que el pedido estaba.
 */
export async function registrarPendiente(pendiente: PendienteCola): Promise<ResultadoCarga> {
  await encolar(pendiente);
  const { errores } = await sincronizar();

  const propio = errores.get(pendiente.visitaId);
  if (propio) return { estado: "rechazado", motivo: propio };

  const sigueEnCola = (await leerCola()).some((p) => p.visitaId === pendiente.visitaId);
  return sigueEnCola ? { estado: "en-cola" } : { estado: "subido" };
}

/**
 * Marca un pedido como preparado o entregado (o lo cobra), ande o no la señal.
 * Mismo camino que los pedidos: primero se anota en el celular y después se
 * intenta subir, así el vendedor nunca pierde lo que marcó en la calle.
 */
export async function registrarCambioEstado(
  cambio: CambioEstadoPendiente
): Promise<ResultadoCarga> {
  await encolarEstado(cambio);
  const { errores } = await sincronizar();

  const propio = errores.get(cambio.pedidoId);
  if (propio) return { estado: "rechazado", motivo: propio };

  const sigueEnCola = (await leerColaEstados()).some((c) => c.pedidoId === cambio.pedidoId);
  return sigueEnCola ? { estado: "en-cola" } : { estado: "subido" };
}

export interface ResultadoSincronizacion {
  subidos: number;
  pendientes: number;
  /** Motivo del rechazo, por visitaId o pedidoId, de lo que no pudo subir en esta pasada. */
  errores: Map<string, string>;
}

export async function sincronizar(): Promise<ResultadoSincronizacion> {
  const cola = await leerCola();
  const colaEstados = await leerColaEstados();
  const errores = new Map<string, string>();
  if (cola.length === 0 && colaEstados.length === 0) {
    return { subidos: 0, pendientes: 0, errores };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { subidos: 0, pendientes: cola.length + colaEstados.length, errores };
  }

  const supabase = crearClienteNavegador();
  let subidos = 0;

  for (const pendiente of cola) {
    const { error } = await supabase.rpc("sincronizar_pedido", {
      p_visita_id: pendiente.visitaId,
      p_comercio_id: pendiente.comercioId,
      p_fecha_hora: pendiente.fechaHora,
      p_pedido_id: pendiente.pedidoId,
      p_items: pendiente.items,
    });

    if (!error) {
      await quitarDeCola(pendiente.visitaId);
      subidos += 1;
      continue;
    }

    // Un rechazo del servidor (comercio dado de baja, producto que ya no
    // existe, fecha vencida) no se arregla reintentando: se anota el motivo
    // y se deja en la cola para que el vendedor lo vea y avise.
    errores.set(pendiente.visitaId, error.message);
    await encolar({ ...pendiente, error: error.message });
  }

  // Los estados van DESPUÉS de los pedidos, a propósito: si el vendedor cargó
  // un pedido y lo entregó todo sin señal, el pedido tiene que existir en la
  // base antes de que se le pueda cambiar el estado. Si aun así el pedido no
  // llegó a subir, el cambio queda en la cola y entra en la próxima pasada.
  for (const cambio of colaEstados) {
    const { error } = cambio.cobrar
      ? await supabase.rpc("marcar_cobrado", { p_pedido_id: cambio.pedidoId })
      : await supabase.rpc("cambiar_estado_pedido", {
          p_pedido_id: cambio.pedidoId,
          p_estado: cambio.estado,
          p_forma_pago: cambio.formaPago,
        });

    if (!error) {
      await quitarEstadoDeCola(cambio.pedidoId);
      subidos += 1;
      continue;
    }

    errores.set(cambio.pedidoId, error.message);
    await encolarEstado({ ...cambio, error: error.message });
  }

  const pendientes = (await leerCola()).length + (await leerColaEstados()).length;
  return { subidos, pendientes, errores };
}

/** Refresca el catálogo guardado en el celular. Silencioso si no hay señal. */
export async function refrescarCatalogo(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const supabase = crearClienteNavegador();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: comercios }, { data: productos }, { data: perfil }, { data: pedidos }] =
    await Promise.all([
      supabase.from("comercios").select("id, codigo, nombre, localidad").eq("activo", true).order("codigo"),
      supabase.from("productos").select("id, nombre, precio, unidad_medida").eq("activo", true).order("nombre"),
      user
        ? supabase.from("usuarios").select("nombre").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      // Los últimos pedidos, para poder repetirlos sin señal. Se traen los más
      // recientes y se guarda uno por comercio: alcanza para que cada comercio
      // de la cartera tenga el suyo sin bajarse el historial entero.
      user
        ? supabase
            .from("pedidos")
            .select("comercio_id, fecha, pedido_items(producto_id, cantidad)")
            .eq("vendedor_id", user.id)
            .order("fecha", { ascending: false })
            .limit(300)
        : Promise.resolve({ data: null }),
    ]);

  if (comercios && productos) {
    // CP2 antes que CP10: el vendedor busca por código en la lista.
    await guardarCatalogo(ordenarPorCodigo(comercios), productos);
  }
  if (perfil?.nombre) {
    await guardarPerfil(perfil.nombre);
  }

  if (pedidos) {
    // Vienen ordenados del más nuevo al más viejo: el primero de cada comercio
    // es el último que se le cargó.
    const porComercio: Record<string, { producto_id: string; cantidad: number }[]> = {};
    for (const pedido of pedidos) {
      const items = pedido.pedido_items ?? [];
      if (porComercio[pedido.comercio_id] || items.length === 0) continue;
      porComercio[pedido.comercio_id] = items.map((item) => ({
        producto_id: item.producto_id,
        // numeric llega como string (ver docs/PLAN.md sección 10).
        cantidad: Number(item.cantidad),
      }));
    }
    await guardarUltimosPedidos(porComercio);
  }
}
