import { estilos } from "@/components/ui";
import { requerirVendedor } from "@/lib/auth";
import { mesActual, mesDesdeValor, ultimosMeses } from "@/lib/fechas";
import { formatearCantidad, formatearComision, formatearPrecio } from "@/lib/formato";

interface FilaRanking {
  id: string;
  nombre: string;
  detalle: string;
  valor: number;
}

/** Una barra proporcional al máximo de la lista, para ver de un vistazo quién
 * lidera sin tener que comparar números. */
function BarraRanking({ fila, maximo }: { fila: FilaRanking; maximo: number }) {
  const porcentaje = maximo > 0 ? Math.round((fila.valor / maximo) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium text-stone-900">{fila.nombre}</span>
        <span className="shrink-0 text-stone-500">{fila.detalle}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-stone-900" style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  );
}

export default async function PaginaResumen({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { supabase, userId } = await requerirVendedor();
  const { mes: mesPedido } = await searchParams;

  // Si el mes de la URL no sirve, se muestra el mes en curso.
  const mes = (mesPedido ? mesDesdeValor(mesPedido) : null) ?? mesActual();

  const [{ data: perfil }, { data: pedidos }, { count: visitas }, { data: comercios }, { data: productos }] =
    await Promise.all([
      supabase.from("usuarios").select("comision_pct").eq("id", userId).maybeSingle(),
      supabase
        .from("pedidos")
        // Los ítems vienen anidados en la misma consulta: antes se pedían en
        // una segunda vuelta, y eso obligaba al celular del repartidor a
        // esperar dos viajes al servidor en vez de uno.
        .select("id, comercio_id, total, pedido_items(producto_id, cantidad, subtotal)")
        .eq("vendedor_id", userId)
        .gte("fecha", mes.desde)
        .lte("fecha", `${mes.hasta}T23:59:59`),
      supabase
        .from("visitas")
        .select("id", { count: "exact", head: true })
        .eq("vendedor_id", userId)
        .gte("fecha_hora", mes.desde)
        .lte("fecha_hora", `${mes.hasta}T23:59:59`),
      supabase.from("comercios").select("id, codigo, nombre"),
      supabase.from("productos").select("id, nombre, unidad_medida"),
    ]);

  const items = (pedidos ?? []).flatMap((pedido) => pedido.pedido_items ?? []);

  // Todas las columnas numeric llegan como string: sumarlas con + sin
  // convertir concatenaría texto en vez de sumar (ver docs/PLAN.md sección 10).
  const totalVendido = (pedidos ?? []).reduce((acc, p) => acc + Number(p.total), 0);
  const comisionPct = Number(perfil?.comision_pct ?? 0);
  const comisionGanada = (totalVendido * comisionPct) / 100;

  const porComercio = new Map<string, { pedidos: number; total: number }>();
  for (const pedido of pedidos ?? []) {
    const actual = porComercio.get(pedido.comercio_id) ?? { pedidos: 0, total: 0 };
    actual.pedidos += 1;
    actual.total += Number(pedido.total);
    porComercio.set(pedido.comercio_id, actual);
  }
  const topComercios: FilaRanking[] = [...porComercio.entries()]
    .map(([id, resumen]) => {
      const comercio = (comercios ?? []).find((c) => c.id === id);
      return {
        id,
        nombre: comercio ? `${comercio.codigo} · ${comercio.nombre}` : "Comercio dado de baja",
        detalle: formatearPrecio(resumen.total),
        valor: resumen.total,
      };
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const porProducto = new Map<string, { cantidad: number; importe: number }>();
  for (const item of items) {
    const actual = porProducto.get(item.producto_id) ?? { cantidad: 0, importe: 0 };
    actual.cantidad += Number(item.cantidad);
    actual.importe += Number(item.subtotal);
    porProducto.set(item.producto_id, actual);
  }
  const topProductos: FilaRanking[] = [...porProducto.entries()]
    .map(([id, resumen]) => {
      const producto = (productos ?? []).find((p) => p.id === id);
      return {
        id,
        nombre: producto?.nombre ?? "Producto dado de baja",
        detalle: `${formatearCantidad(resumen.cantidad)} ${producto?.unidad_medida ?? ""}`,
        valor: resumen.importe,
      };
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const maximoComercio = Math.max(1, ...topComercios.map((f) => f.valor));
  const maximoProducto = Math.max(1, ...topProductos.map((f) => f.valor));

  return (
    <>
      <div>
        <h1 className="text-lg font-semibold text-stone-900">Resumen</h1>
        <p className="text-sm text-stone-500">Cómo te fue en el mes.</p>
      </div>

      <form className="flex items-end gap-2">
        <label className="flex-1 space-y-1 text-sm">
          <span className={estilos.etiqueta}>Mes</span>
          <select name="mes" defaultValue={mes.valor} className={estilos.input}>
            {ultimosMeses(6).map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={estilos.botonSecundario}>
          Ver
        </button>
      </form>

      <div className={`${estilos.tarjeta} grid grid-cols-2 gap-4 p-4`}>
        <div>
          <p className="text-xs text-stone-500">Vendido</p>
          <p className="text-lg font-semibold text-stone-900">{formatearPrecio(totalVendido)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Tu comisión ({formatearComision(comisionPct)})</p>
          <p className="text-lg font-semibold text-stone-900">{formatearPrecio(comisionGanada)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Pedidos</p>
          <p className="text-lg font-semibold text-stone-900">{(pedidos ?? []).length}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Visitas</p>
          <p className="text-lg font-semibold text-stone-900">{visitas ?? 0}</p>
        </div>
      </div>

      <div className={`${estilos.tarjeta} space-y-3 p-4`}>
        <p className="text-sm font-medium text-stone-900">Quién más te compra</p>
        {topComercios.length === 0 ? (
          <p className="text-sm text-stone-500">Todavía no hay pedidos este mes.</p>
        ) : (
          <div className="space-y-3">
            {topComercios.map((fila) => (
              <BarraRanking key={fila.id} fila={fila} maximo={maximoComercio} />
            ))}
          </div>
        )}
      </div>

      <div className={`${estilos.tarjeta} space-y-3 p-4`}>
        <p className="text-sm font-medium text-stone-900">Lo que más vendés</p>
        {topProductos.length === 0 ? (
          <p className="text-sm text-stone-500">Todavía no hay pedidos este mes.</p>
        ) : (
          <div className="space-y-3">
            {topProductos.map((fila) => (
              <BarraRanking key={fila.id} fila={fila} maximo={maximoProducto} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
