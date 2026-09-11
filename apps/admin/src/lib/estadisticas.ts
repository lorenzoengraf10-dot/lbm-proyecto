import type { SesionAdmin } from "./auth";
import { itemsDeLosPedidos } from "./reporte-semanal";

export interface FilaRanking {
  id: string;
  nombre: string;
  detalle: string;
  valor: number;
}

export interface Estadisticas {
  totalFacturado: number;
  cantidadPedidos: number;
  ticketPromedio: number;
  comercios: FilaRanking[];
  productos: FilaRanking[];
  vendedores: FilaRanking[];
}

const TOP = 12;

/**
 * El panel de estadísticas del admin: quién compra más, qué se vende más y
 * quién vende más, para cualquier rango de fechas. Separado de
 * reporte-semanal.ts porque ese archivo es la fuente exacta del PDF semanal
 * (no conviene tocarlo para un caso de uso distinto) — pero reutiliza
 * itemsDeLosPedidos, que ya resuelve el mismo problema de traer los ítems de
 * muchos pedidos sin pasarse del largo de URL que soporta PostgREST.
 */
export async function armarEstadisticas(
  supabase: SesionAdmin["supabase"],
  /** Sin desde/hasta: todo el historial (para "qué cliente compró más" sin acotar). */
  desde?: string,
  hasta?: string
): Promise<Estadisticas> {
  let consultaPedidos = supabase.from("pedidos").select("id, comercio_id, vendedor_id, total");
  if (desde) consultaPedidos = consultaPedidos.gte("fecha", desde);
  if (hasta) consultaPedidos = consultaPedidos.lte("fecha", `${hasta}T23:59:59`);

  const [{ data: pedidos }, { data: comercios }, { data: productos }, { data: vendedores }] =
    await Promise.all([
      consultaPedidos,
      supabase.from("comercios").select("id, codigo, nombre"),
      supabase.from("productos").select("id, nombre, unidad_medida"),
      supabase.from("usuarios").select("id, nombre").eq("rol", "vendedor"),
    ]);

  const items = await itemsDeLosPedidos(
    supabase,
    (pedidos ?? []).map((p) => p.id)
  );

  // Number() en todas: las columnas numeric llegan como string y sumarlas con
  // + concatenaría texto en vez de sumar (ver docs/PLAN.md sección 10).
  const totalFacturado = (pedidos ?? []).reduce((acc, p) => acc + Number(p.total), 0);

  const porComercio = new Map<string, { pedidos: number; total: number }>();
  const porVendedor = new Map<string, { pedidos: number; total: number }>();
  for (const pedido of pedidos ?? []) {
    const c = porComercio.get(pedido.comercio_id) ?? { pedidos: 0, total: 0 };
    c.pedidos += 1;
    c.total += Number(pedido.total);
    porComercio.set(pedido.comercio_id, c);

    const v = porVendedor.get(pedido.vendedor_id) ?? { pedidos: 0, total: 0 };
    v.pedidos += 1;
    v.total += Number(pedido.total);
    porVendedor.set(pedido.vendedor_id, v);
  }

  const porProducto = new Map<string, { cantidad: number; importe: number }>();
  for (const item of items) {
    const p = porProducto.get(item.producto_id) ?? { cantidad: 0, importe: 0 };
    p.cantidad += Number(item.cantidad);
    p.importe += Number(item.subtotal);
    porProducto.set(item.producto_id, p);
  }

  const rankingComercios: FilaRanking[] = [...porComercio.entries()]
    .map(([id, resumen]) => {
      const comercio = (comercios ?? []).find((c) => c.id === id);
      return {
        id,
        nombre: comercio ? `${comercio.codigo} · ${comercio.nombre}` : "Comercio eliminado",
        detalle: `${resumen.pedidos} ${resumen.pedidos === 1 ? "pedido" : "pedidos"}`,
        valor: resumen.total,
      };
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, TOP);

  const rankingProductos: FilaRanking[] = [...porProducto.entries()]
    .map(([id, resumen]) => {
      const producto = (productos ?? []).find((p) => p.id === id);
      const cantidad = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(
        resumen.cantidad
      );
      return {
        id,
        nombre: producto?.nombre ?? "Producto eliminado",
        detalle: `${cantidad} ${producto?.unidad_medida ?? ""}`,
        valor: resumen.importe,
      };
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, TOP);

  const rankingVendedores: FilaRanking[] = [...porVendedor.entries()]
    .map(([id, resumen]) => {
      const vendedor = (vendedores ?? []).find((v) => v.id === id);
      return {
        id,
        nombre: vendedor?.nombre ?? "Usuario eliminado",
        detalle: `${resumen.pedidos} ${resumen.pedidos === 1 ? "pedido" : "pedidos"}`,
        valor: resumen.total,
      };
    })
    .sort((a, b) => b.valor - a.valor);

  return {
    totalFacturado,
    cantidadPedidos: (pedidos ?? []).length,
    ticketPromedio: (pedidos ?? []).length > 0 ? totalFacturado / (pedidos ?? []).length : 0,
    comercios: rankingComercios,
    productos: rankingProductos,
    vendedores: rankingVendedores,
  };
}
