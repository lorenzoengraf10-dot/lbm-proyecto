import { ITEMS_ANIDADOS, ordenarPorCodigo, type RangoDias } from "@lbm/shared";
import type { SesionAdmin } from "./auth";

/** Carmen de Patagones, para centrar el mapa cuando todavía no hay puntos. */
export const CENTRO_PATAGONES = { lat: -40.7969, lng: -62.9834 };

/** El nombre que lleva el grupo de los que todavía no tienen zona asignada. */
export const SIN_ZONA = "Sin zona";

export type EstadoEnElMapa = "pidio" | "visitado" | "sin-visitar";

/**
 * Los tres estados, con su color y su nombre. Verde vendió, ámbar pasó pero no
 * compró, gris ni se pasó. Además del color va el tamaño: impreso en blanco y
 * negro, o para alguien que distingue mal los colores, el punto más grande
 * sigue siendo el que vendió.
 *
 * Vive acá y no en el componente del mapa a propósito: ese archivo es
 * "use client", y cuando una pantalla del servidor importa un valor de un
 * módulo de cliente no recibe el objeto sino un proxy — la referencia de
 * colores salía vacía y sin ningún error.
 */
export const COLORES: Record<EstadoEnElMapa, { color: string; radio: number; etiqueta: string }> = {
  pidio: { color: "#15803d", radio: 9, etiqueta: "Pidió" },
  visitado: { color: "#b45309", radio: 7, etiqueta: "Visitado, no pidió" },
  "sin-visitar": { color: "#a8a29e", radio: 5, etiqueta: "Sin visitar" },
};

export interface PuntoComercio {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  zona: string;
  lat: number | null;
  lng: number | null;
  estado: EstadoEnElMapa;
  visitas: number;
  pedidos: number;
  totalPesos: number;
}

export interface ResumenZona {
  zona: string;
  comercios: number;
  enElMapa: number;
  visitados: number;
  pidieron: number;
  totalPesos: number;
}

export interface Mapa {
  /** Los que tienen coordenadas: son los que se dibujan. */
  puntos: PuntoComercio[];
  /** Los que todavía no: se listan aparte para saber a cuáles les falta. */
  sinUbicacion: PuntoComercio[];
  /** Para el estudio de mercado: cómo le va a cada parte del pueblo. */
  zonas: ResumenZona[];
  /** Dónde arranca el mapa: el medio de lo que hay cargado. */
  centro: { lat: number; lng: number };
  desde: string;
  hasta: string;
}

/**
 * El mapa de la cartera: dónde está cada comercio y cómo le fue en el tramo.
 *
 * Tres estados, que son los que el dueño quiere distinguir de un vistazo:
 *   * pidió — se le vendió algo en el tramo,
 *   * visitado — pasó el repartidor pero no compró (el más interesante: ahí
 *     hay algo que averiguar),
 *   * sin visitar — ni siquiera se pasó.
 *
 * Los comercios sin coordenadas no se pierden: van en su propia lista, porque
 * si no quedarían invisibles justo al principio, que es cuando falta casi todo.
 */
export async function armarMapa(
  supabase: SesionAdmin["supabase"],
  rango: RangoDias,
  zonaElegida?: string
): Promise<Mapa> {
  const [{ data: comercios }, { data: visitas }, { data: pedidos }] = await Promise.all([
    supabase
      .from("comercios")
      .select("id, codigo, nombre, direccion, zona, lat, lng, activo")
      .eq("activo", true)
      .order("codigo"),
    supabase
      .from("visitas")
      .select("comercio_id")
      .gte("fecha_hora", rango.desdeIso)
      .lt("fecha_hora", rango.hastaIso),
    supabase
      .from("pedidos")
      .select(`comercio_id, total, ${ITEMS_ANIDADOS}`)
      .gte("fecha", rango.desdeIso)
      .lt("fecha", rango.hastaIso),
  ]);

  const visitasPorComercio = new Map<string, number>();
  for (const visita of visitas ?? []) {
    visitasPorComercio.set(visita.comercio_id, (visitasPorComercio.get(visita.comercio_id) ?? 0) + 1);
  }

  // Number() en el total: las columnas numeric llegan como string y sumarlas
  // con + concatenaría texto (ver docs/PLAN.md, sección 10).
  const pedidosPorComercio = new Map<string, { cuantos: number; pesos: number }>();
  for (const pedido of pedidos ?? []) {
    const actual = pedidosPorComercio.get(pedido.comercio_id) ?? { cuantos: 0, pesos: 0 };
    actual.cuantos += 1;
    actual.pesos += Number(pedido.total);
    pedidosPorComercio.set(pedido.comercio_id, actual);
  }

  const todos: PuntoComercio[] = ordenarPorCodigo(comercios ?? []).map((comercio) => {
    const visitasDe = visitasPorComercio.get(comercio.id) ?? 0;
    const pedidosDe = pedidosPorComercio.get(comercio.id);
    return {
      id: comercio.id,
      codigo: comercio.codigo,
      nombre: comercio.nombre,
      direccion: comercio.direccion,
      zona: comercio.zona ?? SIN_ZONA,
      lat: comercio.lat === null ? null : Number(comercio.lat),
      lng: comercio.lng === null ? null : Number(comercio.lng),
      estado: pedidosDe ? "pidio" : visitasDe > 0 ? "visitado" : "sin-visitar",
      visitas: visitasDe,
      pedidos: pedidosDe?.cuantos ?? 0,
      totalPesos: pedidosDe?.pesos ?? 0,
    };
  });

  // El resumen por zona se arma sobre TODOS, con o sin ubicación: es para
  // estudiar el mercado, y un comercio existe aunque nadie le haya tomado
  // todavía el punto en el mapa.
  const porZona = new Map<string, ResumenZona>();
  for (const punto of todos) {
    const actual = porZona.get(punto.zona) ?? {
      zona: punto.zona,
      comercios: 0,
      enElMapa: 0,
      visitados: 0,
      pidieron: 0,
      totalPesos: 0,
    };
    actual.comercios += 1;
    if (punto.lat !== null) actual.enElMapa += 1;
    if (punto.visitas > 0) actual.visitados += 1;
    if (punto.estado === "pidio") actual.pidieron += 1;
    actual.totalPesos += punto.totalPesos;
    porZona.set(punto.zona, actual);
  }

  // Lo que más vendió arriba, y "Sin zona" siempre último: es un cajón de
  // pendientes, no una zona del pueblo.
  const zonas = [...porZona.values()].sort((a, b) => {
    if (a.zona === SIN_ZONA) return 1;
    if (b.zona === SIN_ZONA) return -1;
    return b.totalPesos - a.totalPesos || a.zona.localeCompare(b.zona, "es");
  });

  const visiblesEnElMapa = zonaElegida ? todos.filter((p) => p.zona === zonaElegida) : todos;
  const puntos = visiblesEnElMapa.filter((p) => p.lat !== null);

  // El mapa arranca en el medio de lo que hay; sin nada cargado, en el pueblo.
  const centro =
    puntos.length > 0
      ? {
          lat: puntos.reduce((suma, p) => suma + p.lat!, 0) / puntos.length,
          lng: puntos.reduce((suma, p) => suma + p.lng!, 0) / puntos.length,
        }
      : CENTRO_PATAGONES;

  return {
    puntos,
    sinUbicacion: visiblesEnElMapa.filter((p) => p.lat === null),
    zonas,
    centro,
    desde: rango.desde,
    hasta: rango.hasta,
  };
}
