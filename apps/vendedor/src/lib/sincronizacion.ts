"use client";

import { crearClienteNavegador } from "./supabase-browser";
import {
  encolar,
  guardarCatalogo,
  guardarPerfil,
  leerCola,
  quitarDeCola,
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

export interface ResultadoSincronizacion {
  subidos: number;
  pendientes: number;
  /** Motivo del rechazo, por visitaId, de lo que no pudo subir en esta pasada. */
  errores: Map<string, string>;
}

export async function sincronizar(): Promise<ResultadoSincronizacion> {
  const cola = await leerCola();
  const errores = new Map<string, string>();
  if (cola.length === 0) return { subidos: 0, pendientes: 0, errores };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { subidos: 0, pendientes: cola.length, errores };
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

  return { subidos, pendientes: (await leerCola()).length, errores };
}

/** Refresca el catálogo guardado en el celular. Silencioso si no hay señal. */
export async function refrescarCatalogo(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const supabase = crearClienteNavegador();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: comercios }, { data: productos }, { data: perfil }] = await Promise.all([
    supabase.from("comercios").select("id, codigo, nombre, localidad").eq("activo", true).order("codigo"),
    supabase.from("productos").select("id, nombre, precio, unidad_medida").eq("activo", true).order("nombre"),
    user
      ? supabase.from("usuarios").select("nombre").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (comercios && productos) {
    await guardarCatalogo(comercios, productos);
  }
  if (perfil?.nombre) {
    await guardarPerfil(perfil.nombre);
  }
}
