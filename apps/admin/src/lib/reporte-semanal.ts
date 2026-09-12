import { ordenarPorCodigo } from "@lbm/shared";
import type { SesionAdmin } from "./auth";
import type { Semana } from "./semana";

export interface FilaVendedor {
  nombre: string;
  pedidos: number;
  totalVendido: number;
  comisionPct: number;
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
export const PEDIDOS_CON_ITEMS = `id, vendedor_id, total, ${ITEMS_ANIDADOS}`;

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
      supabase
        .from("pedidos")
        .select(PEDIDOS_CON_ITEMS)
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
  const porVendedor = new Map<string, { pedidos: number; total: number }>();
  for (const pedido of pedidos ?? []) {
    const actual = porVendedor.get(pedido.vendedor_id) ?? { pedidos: 0, total: 0 };
    actual.pedidos += 1;
    actual.total += Number(pedido.total);
    porVendedor.set(pedido.vendedor_id, actual);
  }

  const filasVendedores: FilaVendedor[] = (vendedores ?? [])
    .map((vendedor) => {
      const resumen = porVendedor.get(vendedor.id) ?? { pedidos: 0, total: 0 };
      const comisionPct = Number(vendedor.comision_pct);
      return {
        nombre: vendedor.nombre,
        pedidos: resumen.pedidos,
        totalVendido: resumen.total,
        comisionPct,
        comision: (resumen.total * comisionPct) / 100,
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
