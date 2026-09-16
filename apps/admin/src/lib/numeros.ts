import { ITEMS_ANIDADOS, itemsDe } from "@lbm/shared";
import type { SesionAdmin } from "./auth";

export interface FilaRanking {
  id: string;
  nombre: string;
  detalle: string;
  valor: number;
}

export interface FilaVendedor {
  id: string;
  nombre: string;
  activo: boolean;
  pedidos: number;
  totalVendido: number;
  /** Solo los entregados: es sobre esto que se calcula lo que hay que pagar. */
  entregados: number;
  totalEntregado: number;
  comision: number;
  /** Los porcentajes que hubo en el período, por si le cambiaron la comisión. */
  porcentajes: number[];
}

export interface Numeros {
  totalFacturado: number;
  cantidadPedidos: number;
  ticketPromedio: number;
  /** Lo que hay que pagarles a los repartidores por lo entregado en el período. */
  totalComisiones: number;
  vendedores: FilaVendedor[];
  comercios: FilaRanking[];
  productos: FilaRanking[];
}

const TOP = 12;

const formatoCantidad = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/**
 * Todos los números del negocio en un período, de una sola consulta.
 *
 * Antes eran tres pantallas —Estadísticas, Comisiones y Reporte— que
 * contestaban casi lo mismo con tres selectores de fecha distintos: una por
 * mes, otra por desde/hasta y otra por semana. Elegir bien era imposible, y
 * comparar entre ellas todavía más.
 *
 * Hay dos totales y son distintos a propósito, porque las dos preguntas son
 * distintas: lo FACTURADO son todos los pedidos del período (lo que se vendió),
 * y la COMISIÓN sale solo de los entregados (lo que hay que pagar). Un pedido
 * tomado y todavía sin salir del local cuenta en el primero y no en el segundo.
 *
 * El porcentaje sale del pedido y no del vendedor: es el que estaba congelado
 * cuando se cargó, así cambiarle la comisión al repartidor no mueve lo ya
 * ganado, ni siquiera mirando un período viejo.
 */
export async function armarNumeros(
  supabase: SesionAdmin["supabase"],
  /** Sin desde/hasta: todo el historial. */
  desde?: string,
  hasta?: string
): Promise<Numeros> {
  let consultaPedidos = supabase
    .from("pedidos")
    .select(`comercio_id, vendedor_id, total, comision_pct, estado, ${ITEMS_ANIDADOS}`);
  if (desde) consultaPedidos = consultaPedidos.gte("fecha", desde);
  if (hasta) consultaPedidos = consultaPedidos.lte("fecha", `${hasta}T23:59:59`);

  const [{ data: pedidos }, { data: comercios }, { data: productos }, { data: vendedores }] =
    await Promise.all([
      consultaPedidos,
      supabase.from("comercios").select("id, codigo, nombre"),
      supabase.from("productos").select("id, nombre, unidad_medida"),
      supabase
        .from("usuarios")
        .select("id, nombre, comision_pct, activo")
        .eq("rol", "vendedor")
        .order("nombre"),
    ]);

  const items = itemsDe(pedidos);

  // Number() en todas: las columnas numeric llegan como string desde PostgREST
  // y sumarlas con + concatenaría texto en vez de sumar.
  const totalFacturado = (pedidos ?? []).reduce((acumulado, p) => acumulado + Number(p.total), 0);

  const porComercio = new Map<string, { pedidos: number; total: number }>();
  const porVendedor = new Map<
    string,
    {
      pedidos: number;
      total: number;
      entregados: number;
      totalEntregado: number;
      comision: number;
      porcentajes: Set<number>;
    }
  >();

  for (const pedido of pedidos ?? []) {
    const total = Number(pedido.total);

    const comercio = porComercio.get(pedido.comercio_id) ?? { pedidos: 0, total: 0 };
    comercio.pedidos += 1;
    comercio.total += total;
    porComercio.set(pedido.comercio_id, comercio);

    const vendedor = porVendedor.get(pedido.vendedor_id) ?? {
      pedidos: 0,
      total: 0,
      entregados: 0,
      totalEntregado: 0,
      comision: 0,
      porcentajes: new Set<number>(),
    };
    vendedor.pedidos += 1;
    vendedor.total += total;

    if (pedido.estado === "completado") {
      const pct = Number(pedido.comision_pct);
      vendedor.entregados += 1;
      vendedor.totalEntregado += total;
      // Pedido por pedido, cada uno con su porcentaje: un período que cruza un
      // cambio de comisión suma bien las dos mitades.
      vendedor.comision += (total * pct) / 100;
      vendedor.porcentajes.add(pct);
    }

    porVendedor.set(pedido.vendedor_id, vendedor);
  }

  const porProducto = new Map<string, { cantidad: number; importe: number }>();
  for (const item of items) {
    const producto = porProducto.get(item.producto_id) ?? { cantidad: 0, importe: 0 };
    producto.cantidad += Number(item.cantidad);
    producto.importe += Number(item.subtotal);
    porProducto.set(item.producto_id, producto);
  }

  // Los vendedores salen de la tabla y no de los pedidos: el que no vendió
  // nada en el período tiene que aparecer igual, en cero. Si desapareciera,
  // parecería que no existe en vez de que no vendió.
  const filasVendedores: FilaVendedor[] = (vendedores ?? []).map((usuario) => {
    const resumen = porVendedor.get(usuario.id);
    const porcentajes = [...(resumen?.porcentajes ?? [])].sort((a, b) => a - b);
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      activo: usuario.activo,
      pedidos: resumen?.pedidos ?? 0,
      totalVendido: resumen?.total ?? 0,
      entregados: resumen?.entregados ?? 0,
      totalEntregado: resumen?.totalEntregado ?? 0,
      comision: resumen?.comision ?? 0,
      // Sin entregados en el período se muestra el porcentaje que tiene hoy.
      porcentajes: porcentajes.length > 0 ? porcentajes : [Number(usuario.comision_pct)],
    };
  });

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
      return {
        id,
        nombre: producto?.nombre ?? "Producto eliminado",
        detalle: `${formatoCantidad.format(resumen.cantidad)} ${producto?.unidad_medida ?? ""}`,
        valor: resumen.importe,
      };
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, TOP);

  const cantidadPedidos = (pedidos ?? []).length;

  return {
    totalFacturado,
    cantidadPedidos,
    ticketPromedio: cantidadPedidos > 0 ? totalFacturado / cantidadPedidos : 0,
    totalComisiones: filasVendedores.reduce((acumulado, fila) => acumulado + fila.comision, 0),
    vendedores: filasVendedores,
    comercios: rankingComercios,
    productos: rankingProductos,
  };
}
