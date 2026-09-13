import { ordenarPorCodigo } from "@lbm/shared";
import type { SesionAdmin } from "./auth";
import { rangoDelDia } from "./fechas";
import { ITEMS_ANIDADOS, itemsDe } from "./reporte-semanal";

/** Una columna de la planilla: un producto que se pidió ese día. */
export interface ProductoColumna {
  id: string;
  nombre: string;
  unidad: string;
}

export interface FilaPlanilla {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  /** Cuánto pidió de cada producto, por id. Sin la clave = no pidió ese producto. */
  cantidades: Record<string, number>;
  /** Suma de lo que se vende por kilo. Lo que va por unidad no entra acá. */
  totalKg: number;
  totalPesos: number;
  pidio: boolean;
}

export interface PlanillaDia {
  dia: string;
  productos: ProductoColumna[];
  filas: FilaPlanilla[];
  /** Cuánto hay que preparar de cada producto en todo el día, por id. */
  porProducto: Record<string, number>;
  totalKg: number;
  totalPesos: number;
  cuantosPidieron: number;
  /** Hay algo que no se vende por kilo: el total en kg no cuenta todo. */
  hayOtrasUnidades: boolean;
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
  const columnas: ProductoColumna[] = (productos ?? [])
    .filter((producto) => pedidosDelDia.has(producto.id))
    .map((producto) => ({
      id: producto.id,
      nombre: producto.nombre,
      unidad: producto.unidad_medida,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const porKilo = new Set(
    columnas.filter((columna) => esKilo(columna.unidad)).map((columna) => columna.id)
  );

  // Todos los comercios activos, más cualquiera que haya pedido ese día aunque
  // después lo hayan dado de baja: si pidió, tiene que estar en la planilla.
  const visibles = (comercios ?? []).filter(
    (comercio) => comercio.activo || porComercio.has(comercio.id)
  );

  const filas: FilaPlanilla[] = ordenarPorCodigo(visibles)
    .map((comercio) => {
      const resumen = porComercio.get(comercio.id);
      const cantidades = Object.fromEntries(resumen?.cantidades ?? []);
      return {
        id: comercio.id,
        codigo: comercio.codigo,
        nombre: comercio.nombre,
        activo: comercio.activo,
        cantidades,
        totalKg: Object.entries(cantidades).reduce(
          (total, [productoId, cantidad]) => total + (porKilo.has(productoId) ? cantidad : 0),
          0
        ),
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

  return {
    dia,
    productos: columnas,
    filas,
    porProducto,
    totalKg: filas.reduce((total, fila) => total + fila.totalKg, 0),
    totalPesos: filas.reduce((total, fila) => total + fila.totalPesos, 0),
    cuantosPidieron: filas.filter((fila) => fila.pidio).length,
    hayOtrasUnidades: columnas.some((columna) => !esKilo(columna.unidad)),
  };
}

/** El catálogo es casi todo por kilo, pero puede haber algo por unidad o docena. */
function esKilo(unidad: string): boolean {
  const limpia = unidad.trim().toLowerCase();
  return limpia === "kg" || limpia === "kilo" || limpia === "kilos" || limpia === "kilogramo";
}
