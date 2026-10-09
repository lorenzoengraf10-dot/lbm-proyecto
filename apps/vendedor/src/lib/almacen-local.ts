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

// La dirección viaja al celular para que el repartidor sepa llegar sin señal.
// lat viene solo para saber si a ese comercio ya se le tomó la ubicación:
// el punto en sí no se usa en la app, se dibuja en el mapa del panel.
export type ComercioLocal = Pick<
  Tabla<"comercios">,
  "id" | "codigo" | "nombre" | "localidad" | "direccion" | "zona" | "lat"
>;
export type ProductoLocal = Pick<Tabla<"productos">, "id" | "nombre" | "precio" | "unidad_medida">;

export interface PendienteCola {
  /** UUID generado en el celular: es lo que hace idempotente la sincronización. */
  visitaId: string;
  comercioId: string;
  comercioNombre: string;
  fechaHora: string;
  pedidoId: string | null;
  items: { producto_id: string; cantidad: number }[];
  /**
   * Por qué se cargó sin escanear el QR. null/ausente = se escaneó, que es lo
   * normal. Viaja en la cola porque el pedido puede quedar guardado en el
   * celular horas antes de subir, y el motivo es parte del pedido.
   */
  sinQrMotivo?: string | null;
  /**
   * El repartidor que lo cargó. Solo sube con la sesión de él: si sube con
   * la de otro, sincronizar_pedido lo anota (y le paga la comisión) a quien
   * esté logueado en ese momento. Ausente = cargado antes de que existiera
   * este campo; es del dueño guardado del celular.
   */
  vendedorId?: string;
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

export async function leerDuenio(): Promise<string | null> {
  return (await conStore<string>(CATALOGO, "readonly", (s) => s.get("duenio"))) ?? null;
}

/**
 * Deja el celular listo para este repartidor.
 *
 * Lo que es del anterior y se puede volver a bajar (cartera, nombre, deudas,
 * últimos pedidos) se borra. Lo que NO se puede volver a bajar —sus pedidos y
 * cambios de estado sin subir— se queda, marcado con su dueño, y espera a que
 * él vuelva a entrar con señal: sincronizar() solo sube lo de quien tiene la
 * sesión abierta.
 *
 * Antes la cola del anterior se borraba entera. Eran pedidos tomados y sin
 * subir: se perdían sin aviso. Y como la sincronización arrancaba antes que
 * este chequeo (el efecto del proveedor corre antes que el del layout), a
 * veces ganaba la carrera y los subía con la sesión del nuevo, que se quedaba
 * con pedidos y comisión ajenos.
 *
 * Devuelve true si hubo cambio de dueño.
 */
let enCurso: { usuarioId: string; promesa: Promise<boolean> } | null = null;

export function asegurarDuenio(usuarioId: string): Promise<boolean> {
  // El layout y el proveedor de datos lo llaman los dos al abrir. Dos pasadas
  // en paralelo leerían el mismo dueño anterior y la segunda podría vaciar la
  // cartera que la primera acababa de bajar.
  if (enCurso?.usuarioId === usuarioId) return enCurso.promesa;
  const promesa = asegurarDuenioAhora(usuarioId);
  enCurso = { usuarioId, promesa };
  return promesa;
}

async function asegurarDuenioAhora(usuarioId: string): Promise<boolean> {
  const anterior = await leerDuenio();
  if (anterior === usuarioId) return false;

  const base = await abrir();
  try {
    const transaccion = base.transaction([CATALOGO, COLA, COLA_ESTADOS], "readwrite");
    if (anterior) {
      // Lo sin dueño explícito era del anterior: se lo deja escrito antes de
      // cambiar de dueño, porque después "sin marca" querría decir el nuevo.
      for (const nombre of [COLA, COLA_ESTADOS]) {
        const cursor = transaccion.objectStore(nombre).openCursor();
        cursor.onsuccess = () => {
          const actual = cursor.result;
          if (!actual) return;
          const valor = actual.value as { vendedorId?: string };
          if (!valor.vendedorId) actual.update({ ...valor, vendedorId: anterior });
          actual.continue();
        };
      }
      transaccion.objectStore(CATALOGO).clear();
    }
    transaccion.objectStore(CATALOGO).put(usuarioId, "duenio");
    await new Promise<void>((resolver, rechazar) => {
      transaccion.oncomplete = () => resolver();
      transaccion.onerror = () => rechazar(transaccion.error);
    });
  } finally {
    base.close();
  }

  // Las pantallas que guardó el service worker son las del anterior: sus
  // pedidos, su resumen. Sin señal se le mostrarían al nuevo. Se borran (los
  // archivos de la app, que son iguales para todos, quedan).
  if (anterior && typeof caches !== "undefined") {
    await caches.delete("lbm-vendedor-v1").catch(() => false);
  }
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

/**
 * Lo que un comercio quedó debiendo: pedidos entregados a cuenta corriente
 * que todavía nadie marcó cobrados.
 *
 * Va al celular con el resto del catálogo para que el repartidor lo vea
 * parado en la puerta, que es el único momento en que le sirve. Sin esto
 * tenía que acordarse o llamar, y "el cliente dice que ya pagó" no se podía
 * discutir con nada a mano.
 *
 * Son los pedidos de ÉL: las políticas de la base limitan al repartidor a lo
 * suyo y no se tocaron. Con un solo repartidor es toda la deuda; el día que
 * haya dos, cada uno ve lo que él dejó a cuenta.
 */
export interface DeudaLocal {
  pesos: number;
  pedidos: number;
  /** El más viejo sin cobrar, para poder decir "hace tanto". */
  desde: string;
}

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

export async function guardarDeudas(porComercio: Record<string, DeudaLocal>): Promise<void> {
  await conStore(CATALOGO, "readwrite", (s) => s.put(porComercio, "deudas"));
}

export async function leerDeudas(): Promise<Record<string, DeudaLocal>> {
  return (
    (await conStore<Record<string, DeudaLocal>>(CATALOGO, "readonly", (s) => s.get("deudas"))) ?? {}
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
  /**
   * Con cobrar: antes de cobrar, subir también el estado y la forma de pago
   * de este mismo registro. Es la entrega "a cuenta" que estaba esperando en
   * la cola cuando se marcó el cobro (ver registrarCambioEstado).
   */
  tambienEstado?: boolean;
  /** Quién lo marcó. Mismo criterio que PendienteCola.vendedorId. */
  vendedorId?: string;
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
