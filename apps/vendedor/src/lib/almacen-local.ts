"use client";

import type { EstadoPedido, FormaPago, Tabla } from "@lbm/shared";

// Guarda en el celular lo necesario para trabajar sin señal: el catálogo
// (comercios y productos) para poder buscar y armar el pedido, y una cola de
// visitas/pedidos todavía no subidos. IndexedDB y no localStorage porque esto
// puede ser una cartera de cientos de comercios y una cola de varios días.

const NOMBRE_BASE = "lbm-vendedor";
const VERSION = 2;
const CATALOGO = "catalogo";
const COLA = "cola";
const COLA_ESTADOS = "cola-estados";

export type ComercioLocal = Pick<Tabla<"comercios">, "id" | "codigo" | "nombre" | "localidad">;
export type ProductoLocal = Pick<Tabla<"productos">, "id" | "nombre" | "precio" | "unidad_medida">;

export interface PendienteCola {
  /** UUID generado en el celular: es lo que hace idempotente la sincronización. */
  visitaId: string;
  comercioId: string;
  comercioNombre: string;
  fechaHora: string;
  pedidoId: string | null;
  items: { producto_id: string; cantidad: number }[];
  /** Último error de sincronización, para poder mostrarlo. */
  error?: string;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const solicitud = indexedDB.open(NOMBRE_BASE, VERSION);
    solicitud.onupgradeneeded = () => {
      const base = solicitud.result;
      if (!base.objectStoreNames.contains(CATALOGO)) base.createObjectStore(CATALOGO);
      if (!base.objectStoreNames.contains(COLA)) base.createObjectStore(COLA, { keyPath: "visitaId" });
      // Versión 2: los cambios de estado (preparado/entregado y cómo se cobró)
      // también tienen que poder hacerse sin señal.
      if (!base.objectStoreNames.contains(COLA_ESTADOS)) {
        base.createObjectStore(COLA_ESTADOS, { keyPath: "pedidoId" });
      }
    };
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
  });
}

function comoPromesa<T>(solicitud: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
  });
}

async function conStore<T>(
  store: string,
  modo: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const base = await abrir();
  try {
    return await comoPromesa(fn(base.transaction(store, modo).objectStore(store)));
  } finally {
    base.close();
  }
}

/**
 * Deja el celular listo para este repartidor, borrando lo del anterior si
 * había otro.
 *
 * Sin esto, en un celular compartido quedaba el catálogo, el nombre y —lo
 * grave— la cola de pedidos sin subir del repartidor anterior. Esa cola se
 * habría sincronizado con la sesión del nuevo, y como sincronizar_pedido
 * fuerza vendedor_id = auth.uid(), los pedidos de uno habrían terminado
 * contados (y comisionados) al otro.
 *
 * Devuelve true si hubo cambio de dueño, o sea si se borró algo.
 */
export async function asegurarDuenio(usuarioId: string): Promise<boolean> {
  const anterior = await conStore<string>(CATALOGO, "readonly", (s) => s.get("duenio"));
  if (anterior === usuarioId) return false;

  if (anterior) {
    const base = await abrir();
    try {
      const transaccion = base.transaction([CATALOGO, COLA, COLA_ESTADOS], "readwrite");
      transaccion.objectStore(CATALOGO).clear();
      transaccion.objectStore(COLA).clear();
      transaccion.objectStore(COLA_ESTADOS).clear();
      await new Promise<void>((resolver, rechazar) => {
        transaccion.oncomplete = () => resolver();
        transaccion.onerror = () => rechazar(transaccion.error);
      });
    } finally {
      base.close();
    }
  }

  await conStore(CATALOGO, "readwrite", (s) => s.put(usuarioId, "duenio"));
  return Boolean(anterior);
}

export async function guardarPerfil(nombre: string): Promise<void> {
  await conStore(CATALOGO, "readwrite", (s) => s.put(nombre, "perfil"));
}

export async function leerPerfil(): Promise<string> {
  return (await conStore<string>(CATALOGO, "readonly", (s) => s.get("perfil"))) ?? "";
}

export async function guardarCatalogo(
  comercios: ComercioLocal[],
  productos: ProductoLocal[]
): Promise<void> {
  const base = await abrir();
  try {
    const transaccion = base.transaction(CATALOGO, "readwrite");
    const store = transaccion.objectStore(CATALOGO);
    store.put(comercios, "comercios");
    store.put(productos, "productos");
    await new Promise<void>((resolver, rechazar) => {
      transaccion.oncomplete = () => resolver();
      transaccion.onerror = () => rechazar(transaccion.error);
    });
  } finally {
    base.close();
  }
}

export async function leerComercios(): Promise<ComercioLocal[]> {
  return (await conStore<ComercioLocal[]>(CATALOGO, "readonly", (s) => s.get("comercios"))) ?? [];
}

/**
 * Lo último que cada comercio pidió, guardado en el celular.
 *
 * Los comercios piden casi siempre lo mismo, así que tenerlo a mano convierte
 * "escribir seis cantidades" en un toque. Y como vive acá, sirve igual sin
 * señal, que es cuando el repartidor lo necesita.
 */
export type ItemUltimoPedido = { producto_id: string; cantidad: number };

export async function guardarUltimosPedidos(
  porComercio: Record<string, ItemUltimoPedido[]>
): Promise<void> {
  await conStore(CATALOGO, "readwrite", (s) => s.put(porComercio, "ultimos-pedidos"));
}

export async function leerUltimosPedidos(): Promise<Record<string, ItemUltimoPedido[]>> {
  return (
    (await conStore<Record<string, ItemUltimoPedido[]>>(CATALOGO, "readonly", (s) =>
      s.get("ultimos-pedidos")
    )) ?? {}
  );
}

export async function leerProductos(): Promise<ProductoLocal[]> {
  return (await conStore<ProductoLocal[]>(CATALOGO, "readonly", (s) => s.get("productos"))) ?? [];
}

export async function encolar(pendiente: PendienteCola): Promise<void> {
  await conStore(COLA, "readwrite", (s) => s.put(pendiente));
}

export async function leerCola(): Promise<PendienteCola[]> {
  return (await conStore<PendienteCola[]>(COLA, "readonly", (s) => s.getAll())) ?? [];
}

export async function quitarDeCola(visitaId: string): Promise<void> {
  await conStore(COLA, "readwrite", (s) => s.delete(visitaId));
}

/**
 * Un cambio de estado esperando a subir. La clave es el pedido, así que si el
 * vendedor lo marca preparado y después entregado sin señal, queda solo el
 * último — que es justo lo que hay que mandar. Y mandar dos veces el mismo
 * cambio da el mismo resultado, así que reintentar nunca rompe nada.
 */
export interface CambioEstadoPendiente {
  pedidoId: string;
  estado: EstadoPedido;
  formaPago: FormaPago | null;
  /** true = marcar cobrado un pedido que había quedado a cuenta. */
  cobrar?: boolean;
  error?: string;
}

export async function encolarEstado(cambio: CambioEstadoPendiente): Promise<void> {
  await conStore(COLA_ESTADOS, "readwrite", (s) => s.put(cambio));
}

export async function leerColaEstados(): Promise<CambioEstadoPendiente[]> {
  return (
    (await conStore<CambioEstadoPendiente[]>(COLA_ESTADOS, "readonly", (s) => s.getAll())) ?? []
  );
}

export async function quitarEstadoDeCola(pedidoId: string): Promise<void> {
  await conStore(COLA_ESTADOS, "readwrite", (s) => s.delete(pedidoId));
}
