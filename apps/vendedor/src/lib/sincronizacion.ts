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

/**
 * Todo lo que el vendedor carga pasa primero por la cola local y recién
 * después sube. Con señal la subida tarda un parpadeo; sin señal queda
 * esperando y se reintenta sola. Es un solo camino para los dos casos, en vez
 * de un "modo offline" aparte que se prueba poco y se rompe callado.
 */
export async function registrarPendiente(pendiente: PendienteCola): Promise<void> {
  await encolar(pendiente);
  await sincronizar();
}

export interface ResultadoSincronizacion {
  subidos: number;
  pendientes: number;
}

export async function sincronizar(): Promise<ResultadoSincronizacion> {
  const cola = await leerCola();
  if (cola.length === 0) return { subidos: 0, pendientes: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { subidos: 0, pendientes: cola.length };
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
    await encolar({ ...pendiente, error: error.message });
  }

  return { subidos, pendientes: (await leerCola()).length };
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
