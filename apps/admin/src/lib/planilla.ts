import { ordenarPorCodigo } from "@lbm/shared";
import { abreviarNombres } from "./abreviar";
import type { SesionAdmin } from "./auth";
import type { RangoDias } from "./fechas";
import { formatearCantidad } from "./formato";
import { ITEMS_ANIDADOS } from "./reporte-semanal";
import { claveUnidad, ordenarUnidades, unidadCorta } from "./unidades";

/** Un producto dentro del pedido de un comercio. */
export interface LineaPedido {
  productoId: string;
  /** Como está en el catálogo. */
  nombre: string;
  /** Corto: la abreviatura que cargó el dueño, o el nombre acortado solo. */
  corto: string;
  cantidad: number;
  /** "kg", "un.", "doc." */
  unidad: string;
  /** Lo que va escrito en la celda: "Bondiola 2,5 kg". */
  texto: string;
}

export interface UnidadDeTotal {
  clave: string;
  corta: string;
}

export interface FilaPlanilla {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  /** Lo que pidió, un producto atrás del otro. Vacío si no pidió nada. */
  lineas: LineaPedido[];
  totalPesos: number;
  pidio: boolean;
}

export interface Planilla {
  /** Primer día del tramo, YYYY-MM-DD. */
  desde: string;
  /** Último día del tramo, YYYY-MM-DD. Igual a `desde` si es un día solo. */
  hasta: string;
  /** true si solo se contaron los pedidos que todavía falta armar. */
  soloFaltaArmar: boolean;
  filas: FilaPlanilla[];
  /** Cuántos productos pidió el que más pidió: cuántas celdas hacen falta. */
  maxLineas: number;
  /** Lo que hay que preparar en total, un renglón por producto. */
  preparar: LineaPedido[];
  /** Las unidades que aparecen, el kilo primero. */
  unidades: UnidadDeTotal[];
  /** El total por unidad. */
  totales: Record<string, number>;
  totalPesos: number;
  cuantosPidieron: number;
}

export interface OpcionesPlanilla {
  /** Dejar afuera a los que no pidieron nada en el tramo. */
  soloQuePidieron?: boolean;
  /** Contar solo los pedidos todavía sin preparar: lo que falta armar. */
  soloFaltaArmar?: boolean;
}

/**
 * La planilla de un día o de un tramo de días: una fila por comercio con lo
 * que pidió escrito uno atrás del otro, y abajo lo que hay que preparar en
 * total. Es lo que se arma a la mañana y lo que se lleva al reparto.
 *
 * Sobre un tramo de varios días las cantidades se suman: un comercio que pidió
 * el lunes y el miércoles sale en una fila sola con el total. Eso es lo que
 * sirve para armar, pero quiere decir que la planilla de un tramo dice *cuánto
 * en total* y no *cuándo* — no se reconcilia pedido por pedido.
 *
 * Las opciones van en un objeto y no como booleanos sueltos a propósito:
 * armarPlanilla(sb, rango, true, false) es exactamente la llamada que alguien
 * da vuelta sin que nadie se entere, porque las dos combinaciones devuelven
 * planillas que parecen razonables.
 *
 * Los números salen todos de acá, igual que reporte-semanal.ts, para que la
 * pantalla y el Excel no puedan discrepar.
 */
export async function armarPlanilla(
  supabase: SesionAdmin["supabase"],
  rango: RangoDias,
  { soloQuePidieron = false, soloFaltaArmar = false }: OpcionesPlanilla = {}
): Promise<Planilla> {
  // El filtro por estado va en la consulta y no filtrando las filas después:
  // un comercio puede tener dos pedidos el mismo día, uno ya entregado y otro
  // recién tomado, y lo que falta armar es solo el segundo.
  let consulta = supabase
    .from("pedidos")
    .select(`comercio_id, total, ${ITEMS_ANIDADOS}`)
    .gte("fecha", rango.desdeIso)
    .lt("fecha", rango.hastaIso);
  if (soloFaltaArmar) consulta = consulta.eq("estado", "pedido");

  const [{ data: pedidos }, { data: comercios }, { data: productos }] = await Promise.all([
    consulta,
    supabase.from("comercios").select("id, codigo, nombre, activo").order("codigo"),
    supabase.from("productos").select("id, nombre, unidad_medida, abreviatura"),
  ]);

  // El nombre acortado solo es el respaldo: manda la abreviatura que cargó el
  // dueño. Se calcula sobre el catálogo entero y no sobre los productos del
  // tramo, si no "Salame" podría ser uno el lunes y otro el martes y comparar
  // dos planillas impresas engañaría.
  const automaticas = abreviarNombres(
    (productos ?? []).map((producto) => producto.nombre),
    // Las que cargó el dueño quedan reservadas: la automática de un producto
    // no puede salir igual que la escrita a mano de otro, o la hoja impresa
    // tendría dos renglones que dicen lo mismo.
    {
      reservadas: (productos ?? [])
        .map((producto) => producto.abreviatura)
        .filter((abreviatura): abreviatura is string => Boolean(abreviatura)),
    }
  );
  const catalogo = new Map(
    (productos ?? []).map((producto) => [
      producto.id,
      {
        nombre: producto.nombre,
        corto: producto.abreviatura ?? automaticas.get(producto.nombre) ?? producto.nombre,
        unidad: unidadCorta(producto.unidad_medida),
        clave: claveUnidad(producto.unidad_medida),
      },
    ])
  );

  // Number() en todas: las columnas numeric llegan como string y sumarlas con
  // + concatenaría texto (ver docs/PLAN.md, sección 10).
  const porComercio = new Map<string, { cantidades: Map<string, number>; pesos: number }>();
  for (const pedido of pedidos ?? []) {
    const actual = porComercio.get(pedido.comercio_id) ?? { cantidades: new Map(), pesos: 0 };
    actual.pesos += Number(pedido.total);
    // Un comercio puede tener más de un pedido (pidió, y más tarde agregó; o
    // pidió dos días del tramo). Para preparar interesa el total, así que se
    // acumulan.
    for (const item of pedido.pedido_items ?? []) {
      const cantidad = Number(item.cantidad);
      actual.cantidades.set(
        item.producto_id,
        (actual.cantidades.get(item.producto_id) ?? 0) + cantidad
      );
    }
    porComercio.set(pedido.comercio_id, actual);
  }

  const armarLinea = (productoId: string, cantidad: number): LineaPedido => {
    const producto = catalogo.get(productoId);
    const nombre = producto?.nombre ?? "Producto eliminado";
    const corto = producto?.corto ?? nombre;
    const unidad = producto?.unidad ?? "";
    return {
      productoId,
      nombre,
      corto,
      cantidad,
      unidad,
      texto: `${corto} ${formatearCantidad(cantidad)} ${unidad}`.trim(),
    };
  };

  // Todos los comercios activos, más cualquiera que haya pedido aunque después
  // lo hayan dado de baja: si pidió, tiene que estar en la planilla.
  const visibles = (comercios ?? []).filter(
    (comercio) => comercio.activo || porComercio.has(comercio.id)
  );

  const filas: FilaPlanilla[] = ordenarPorCodigo(visibles)
    .map((comercio) => {
      const resumen = porComercio.get(comercio.id);
      const lineas = [...(resumen?.cantidades ?? [])]
        .map(([productoId, cantidad]) => armarLinea(productoId, cantidad))
        // Siempre en el mismo orden: así dos planillas de días distintos se
        // pueden comparar de un vistazo.
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      return {
        id: comercio.id,
        codigo: comercio.codigo,
        nombre: comercio.nombre,
        activo: comercio.activo,
        lineas,
        totalPesos: resumen?.pesos ?? 0,
        pidio: resumen !== undefined,
      };
    })
    .filter((fila) => (soloQuePidieron ? fila.pidio : true));

  // Lo que hay que preparar: la suma del tramo de cada producto.
  const sumado = new Map<string, number>();
  for (const fila of filas) {
    for (const linea of fila.lineas) {
      sumado.set(linea.productoId, (sumado.get(linea.productoId) ?? 0) + linea.cantidad);
    }
  }
  const preparar = [...sumado]
    .map(([productoId, cantidad]) => armarLinea(productoId, cantidad))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  // Una línea de total por cada unidad: un kilo y una docena no se suman juntos.
  const totales: Record<string, number> = {};
  for (const linea of preparar) {
    const clave = catalogo.get(linea.productoId)?.clave ?? linea.unidad;
    totales[clave] = (totales[clave] ?? 0) + linea.cantidad;
  }
  const unidades: UnidadDeTotal[] = ordenarUnidades(Object.keys(totales)).map((clave) => ({
    clave,
    corta:
      preparar
        .map((linea) => ({ linea, clave: catalogo.get(linea.productoId)?.clave }))
        .find((par) => par.clave === clave)?.linea.unidad ?? clave,
  }));

  return {
    desde: rango.desde,
    hasta: rango.hasta,
    soloFaltaArmar,
    filas,
    maxLineas: filas.reduce((mayor, fila) => Math.max(mayor, fila.lineas.length), 0),
    preparar,
    unidades,
    totales,
    totalPesos: filas.reduce((total, fila) => total + fila.totalPesos, 0),
    cuantosPidieron: filas.filter((fila) => fila.pidio).length,
  };
}
