import { ordenarPorCodigo } from "@lbm/shared";
import { abreviarNombres } from "./abreviar";
import type { SesionAdmin } from "./auth";
import { rangoDelDia } from "./fechas";
import { ITEMS_ANIDADOS, itemsDe } from "./reporte-semanal";
import { claveUnidad, ordenarUnidades, unidadCorta } from "./unidades";

/** Una columna de la planilla: un producto que se pidió ese día. */
export interface ProductoColumna {
  id: string;
  /** Como está en el catálogo. */
  nombre: string;
  /** Corto, para que el encabezado no estire la columna. */
  corto: string;
  /** "kg", "un.", "doc." */
  unidad: string;
  /** Para agrupar los totales: todo lo que se vende igual suma junto. */
  clave: string;
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
  /** Cuánto pidió de cada producto, por id. Sin la clave = no pidió ese producto. */
  cantidades: Record<string, number>;
  /** Cuánto suma por unidad: los kilos con los kilos, las unidades con las unidades. */
  totales: Record<string, number>;
  totalPesos: number;
  pidio: boolean;
}

export interface PlanillaDia {
  dia: string;
  productos: ProductoColumna[];
  /** Las unidades que aparecen ese día: una columna de total por cada una. */
  unidades: UnidadDeTotal[];
  filas: FilaPlanilla[];
  /** Cuánto hay que preparar de cada producto en todo el día, por id. */
  porProducto: Record<string, number>;
  /** El total del día por unidad. */
  totales: Record<string, number>;
  totalPesos: number;
  cuantosPidieron: number;
}

/**
 * La planilla de un día: todos los comercios con lo que pidió cada uno, una
 * columna por producto. Es lo que se prepara a la mañana y lo que se reparte.
 *
 * Los números salen todos de acá, igual que reporte-semanal.ts, para que la
 * pantalla y el Excel no puedan discrepar.
 */
export async function armarPlanillaDia(
  supabase: SesionAdmin["supabase"],
  dia: string,
  /** Dejar afuera a los que no pidieron nada ese día. */
  soloQuePidieron = false
): Promise<PlanillaDia> {
  const { desdeIso, hastaIso } = rangoDelDia(dia);

  const [{ data: pedidos }, { data: comercios }, { data: productos }] = await Promise.all([
    supabase
      .from("pedidos")
      .select(`comercio_id, total, ${ITEMS_ANIDADOS}`)
      .gte("fecha", desdeIso)
      .lt("fecha", hastaIso),
    supabase.from("comercios").select("id, codigo, nombre, activo").order("codigo"),
    supabase.from("productos").select("id, nombre, unidad_medida"),
  ]);

  // Number() en todas: las columnas numeric llegan como string y sumarlas con
  // + concatenaría texto (ver docs/PLAN.md, sección 10).
  const porComercio = new Map<string, { cantidades: Map<string, number>; pesos: number }>();
  for (const pedido of pedidos ?? []) {
    const actual = porComercio.get(pedido.comercio_id) ?? { cantidades: new Map(), pesos: 0 };
    actual.pesos += Number(pedido.total);
    // Un comercio puede tener más de un pedido en el día (pidió, y más tarde
    // agregó). Para preparar interesa el total, así que se acumulan.
    for (const item of pedido.pedido_items ?? []) {
      const cantidad = Number(item.cantidad);
      actual.cantidades.set(item.producto_id, (actual.cantidades.get(item.producto_id) ?? 0) + cantidad);
    }
    porComercio.set(pedido.comercio_id, actual);
  }

  // Las columnas son solo los productos que se pidieron ese día: poner todo el
  // catálogo llenaría la planilla de columnas vacías.
  const pedidosDelDia = new Set(itemsDe(pedidos).map((item) => item.producto_id));
  const delDia = (productos ?? [])
    .filter((producto) => pedidosDelDia.has(producto.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  // Se abrevian contra el catálogo entero, no contra los productos del día:
  // si no, "Salame" podría ser el picado fino en la planilla del lunes y el
  // tipo milán en la del martes, y comparar dos hojas impresas engañaría.
  const cortos = abreviarNombres((productos ?? []).map((producto) => producto.nombre));

  const columnas: ProductoColumna[] = delDia.map((producto) => ({
    id: producto.id,
    nombre: producto.nombre,
    corto: cortos.get(producto.nombre) ?? producto.nombre,
    unidad: unidadCorta(producto.unidad_medida),
    clave: claveUnidad(producto.unidad_medida),
  }));

  // Una columna de total por cada unidad que aparezca: los kilos no se pueden
  // sumar con las unidades, y el dueño necesita los dos números.
  const unidades: UnidadDeTotal[] = ordenarUnidades([
    ...new Set(columnas.map((columna) => columna.clave)),
  ]).map((clave) => ({
    clave,
    corta: columnas.find((columna) => columna.clave === clave)?.unidad ?? clave,
  }));

  // Todos los comercios activos, más cualquiera que haya pedido ese día aunque
  // después lo hayan dado de baja: si pidió, tiene que estar en la planilla.
  const visibles = (comercios ?? []).filter(
    (comercio) => comercio.activo || porComercio.has(comercio.id)
  );

  const unidadDeProducto = new Map(columnas.map((columna) => [columna.id, columna.clave]));

  const filas: FilaPlanilla[] = ordenarPorCodigo(visibles)
    .map((comercio) => {
      const resumen = porComercio.get(comercio.id);
      const cantidades = Object.fromEntries(resumen?.cantidades ?? []);
      const totales: Record<string, number> = {};
      for (const [productoId, cantidad] of Object.entries(cantidades)) {
        const clave = unidadDeProducto.get(productoId);
        if (clave) totales[clave] = (totales[clave] ?? 0) + cantidad;
      }
      return {
        id: comercio.id,
        codigo: comercio.codigo,
        nombre: comercio.nombre,
        activo: comercio.activo,
        cantidades,
        totales,
        totalPesos: resumen?.pesos ?? 0,
        pidio: resumen !== undefined,
      };
    })
    .filter((fila) => (soloQuePidieron ? fila.pidio : true));

  const porProducto: Record<string, number> = {};
  for (const columna of columnas) {
    porProducto[columna.id] = filas.reduce(
      (total, fila) => total + (fila.cantidades[columna.id] ?? 0),
      0
    );
  }

  const totales: Record<string, number> = {};
  for (const unidad of unidades) {
    totales[unidad.clave] = filas.reduce(
      (total, fila) => total + (fila.totales[unidad.clave] ?? 0),
      0
    );
  }

  return {
    dia,
    productos: columnas,
    unidades,
    filas,
    porProducto,
    totales,
    totalPesos: filas.reduce((total, fila) => total + fila.totalPesos, 0),
    cuantosPidieron: filas.filter((fila) => fila.pidio).length,
  };
}
