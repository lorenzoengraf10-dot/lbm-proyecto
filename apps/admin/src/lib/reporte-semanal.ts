import { ordenarPorCodigo } from "@lbm/shared";
import type { SesionAdmin } from "./auth";
import type { Semana } from "./semana";

export interface FilaVendedor {
  nombre: string;
  pedidos: number;
  totalVendido: number;
  comisionPct: number;
  /** Hubo más de un porcentaje en la semana (le cambiaron la comisión a mitad de camino). */
  comisionPctVarios: boolean;
  comision: number;
}

export interface FilaProducto {
  nombre: string;
  unidad: string;
  cantidad: number;
  importe: number;
}

export interface ReporteSemanal {
  totalFacturado: number;
  totalComisiones: number;
  cantidadPedidos: number;
  vendedores: FilaVendedor[];
  productos: FilaProducto[];
  cobertura: {
    activos: number;
    visitados: number;
    visitas: number;
    noVisitados: { codigo: string; nombre: string }[];
  };
}

// Los ítems vienen anidados dentro de cada pedido, en la misma consulta.
// Antes se pedían aparte con un .in() de todos los ids: eso era un viaje de
// ida y vuelta más (a 120 ms del servidor, se nota) y además armaba una URL
// de decenas de kB cuando la semana traía muchos pedidos.
export const ITEMS_ANIDADOS = "pedido_items(producto_id, cantidad, subtotal)";
// comision_pct viene del pedido, no del vendedor: es el porcentaje congelado
// cuando se cargó, así el reporte de una semana vieja sigue dando lo mismo
// aunque después le hayan cambiado la comisión al repartidor.
export const PEDIDOS_CON_ITEMS = `id, vendedor_id, total, comision_pct, ${ITEMS_ANIDADOS}`;

export type ItemDelReporte = { producto_id: string; cantidad: number; subtotal: number };

/** Junta los ítems de todos los pedidos de una consulta anidada. */
export function itemsDe(pedidos: { pedido_items?: ItemDelReporte[] }[] | null): ItemDelReporte[] {
  return (pedidos ?? []).flatMap((pedido) => pedido.pedido_items ?? []);
}

/**
 * Todos los números del reporte salen de acá, así la pantalla y el PDF no
 * pueden discrepar: si el PDF calculara aparte, tarde o temprano uno de los
 * dos quedaría desactualizado.
 */
export async function armarReporteSemanal(
  supabase: SesionAdmin["supabase"],
  semana: Semana
): Promise<ReporteSemanal> {
  const [{ data: pedidos }, { data: visitas }, { data: vendedores }, { data: comercios }, { data: productos }] =
    await Promise.all([
      // Solo los entregados: la comisión de la semana es lo que hay que pagar,
      // y un pedido que todavía no salió del local no se paga.
      supabase
        .from("pedidos")
        .select(PEDIDOS_CON_ITEMS)
        .eq("estado", "completado")
        .gte("fecha", semana.desdeIso)
        .lt("fecha", semana.hastaIso),
      supabase
        .from("visitas")
        .select("comercio_id")
        .gte("fecha_hora", semana.desdeIso)
        .lt("fecha_hora", semana.hastaIso),
      supabase.from("usuarios").select("id, nombre, comision_pct").eq("rol", "vendedor").order("nombre"),
      supabase.from("comercios").select("id, codigo, nombre").eq("activo", true).order("codigo"),
      supabase.from("productos").select("id, nombre, unidad_medida"),
    ]);

  const items = itemsDe(pedidos);

  // Number() en todas: las columnas numeric de Postgres llegan como string y
  // sumarlas con + concatenaría texto (ver docs/PLAN.md, sección 10).
  const porVendedor = new Map<
    string,
    { pedidos: number; total: number; comision: number; porcentajes: Set<number> }
  >();
  for (const pedido of pedidos ?? []) {
    const actual = porVendedor.get(pedido.vendedor_id) ?? {
      pedidos: 0,
      total: 0,
      comision: 0,
      porcentajes: new Set<number>(),
    };
    const total = Number(pedido.total);
    const pct = Number(pedido.comision_pct);
    actual.pedidos += 1;
    actual.total += total;
    // Uno por uno con su propio porcentaje: si el cambio de comisión cayó a
    // mitad de semana, cada pedido se paga como correspondía ese día.
    actual.comision += (total * pct) / 100;
    actual.porcentajes.add(pct);
    porVendedor.set(pedido.vendedor_id, actual);
  }

  const filasVendedores: FilaVendedor[] = (vendedores ?? [])
    .map((vendedor) => {
      const resumen = porVendedor.get(vendedor.id);
      const porcentajes = [...(resumen?.porcentajes ?? [])].sort((a, b) => a - b);
      return {
        nombre: vendedor.nombre,
        pedidos: resumen?.pedidos ?? 0,
        totalVendido: resumen?.total ?? 0,
        comisionPct: porcentajes.length > 0 ? porcentajes[0] : Number(vendedor.comision_pct),
        comisionPctVarios: porcentajes.length > 1,
        comision: resumen?.comision ?? 0,
      };
    })
    .filter((fila) => fila.pedidos > 0);

  const porProducto = new Map<string, { cantidad: number; importe: number }>();
  for (const item of items) {
    const actual = porProducto.get(item.producto_id) ?? { cantidad: 0, importe: 0 };
    actual.cantidad += Number(item.cantidad);
    actual.importe += Number(item.subtotal);
    porProducto.set(item.producto_id, actual);
  }

  const filasProductos: FilaProducto[] = [...porProducto.entries()]
    .map(([productoId, resumen]) => {
      const producto = (productos ?? []).find((p) => p.id === productoId);
      return {
        nombre: producto?.nombre ?? "Producto eliminado",
        unidad: producto?.unidad_medida ?? "",
        cantidad: resumen.cantidad,
        importe: resumen.importe,
      };
    })
    .sort((a, b) => b.importe - a.importe);

  const visitados = new Set((visitas ?? []).map((visita) => visita.comercio_id));

  return {
    totalFacturado: filasVendedores.reduce((total, fila) => total + fila.totalVendido, 0),
    totalComisiones: filasVendedores.reduce((total, fila) => total + fila.comision, 0),
    cantidadPedidos: (pedidos ?? []).length,
    vendedores: filasVendedores,
    productos: filasProductos,
    cobertura: {
      activos: (comercios ?? []).length,
      visitados: visitados.size,
      visitas: (visitas ?? []).length,
      noVisitados: ordenarPorCodigo(
        (comercios ?? []).filter((comercio) => !visitados.has(comercio.id))
      ).map((comercio) => ({ codigo: comercio.codigo, nombre: comercio.nombre })),
    },
  };
}
