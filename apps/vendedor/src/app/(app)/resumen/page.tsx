import { estilos } from "@/components/ui";
import { requerirVendedor } from "@/lib/auth";
import { comienzoDelDiaIso, finDelDiaIso, formatearCantidad, formatearComision, mesActual, mesDesdeValor, ultimosMeses } from "@lbm/shared";

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
        // esperar dos viajes al servidor en vez de uno. comision_pct es el
        // porcentaje congelado de ESTE pedido, no el que tiene hoy el vendedor.
        // Sin total ni subtotal a propósito: esta pantalla no muestra plata,
        // así que tampoco hace falta traerla al celular.
        .select("id, comercio_id, estado, pedido_items(producto_id, cantidad)")
        .eq("vendedor_id", userId)
        // En hora argentina: contra el día pelado se perdían los pedidos
        // cargados después de las 21 del último día del mes, y eso es plata
        // que el repartidor no veía en su comisión.
        .gte("fecha", comienzoDelDiaIso(mes.desde))
        .lt("fecha", finDelDiaIso(mes.hasta)),
      supabase
        .from("visitas")
        .select("id", { count: "exact", head: true })
        .eq("vendedor_id", userId)
        .gte("fecha_hora", comienzoDelDiaIso(mes.desde))
        .lt("fecha_hora", finDelDiaIso(mes.hasta)),
      supabase.from("comercios").select("id, codigo, nombre"),
      supabase.from("productos").select("id, nombre, unidad_medida"),
    ]);

  // La comisión se gana con el pedido entregado, no con el pedido tomado.
  const entregados = (pedidos ?? []).filter((p) => p.estado === "completado");
  const sinEntregar = (pedidos ?? []).length - entregados.length;

  // De los entregados y no de todos: la tarjeta de arriba dice que cuenta los
  // entregados, y los dos rankings tienen que contar lo mismo. Contando todos,
  // con cero entregados la lista de comercios salía vacía y la de productos
  // llena de kilos, que es una pantalla que se contradice sola.
  const items = entregados.flatMap((pedido) => pedido.pedido_items ?? []);

  // El porcentaje que le queda, y nada más: acá no se muestra un solo peso.
  // Los dueños no quieren que el repartidor vea lo que factura el negocio, y
  // "cuánto vendí en plata" es exactamente eso. Lo que sí es suyo y le sirve
  // es qué movió: a cuántos comercios le vendió y cuántos kilos salieron.
  const comisionPct = Number(perfil?.comision_pct ?? 0);

  // Los rankings van por cantidad, no por importe. Ordenar por plata sería
  // mostrar la misma información con otro nombre: el de arriba de la lista
  // sería el que más factura.
  const porComercio = new Map<string, number>();
  for (const pedido of entregados) {
    porComercio.set(pedido.comercio_id, (porComercio.get(pedido.comercio_id) ?? 0) + 1);
  }
  const topComercios: FilaRanking[] = [...porComercio.entries()]
    .map(([id, pedidos]) => {
      const comercio = (comercios ?? []).find((c) => c.id === id);
      return {
        id,
        nombre: comercio ? `${comercio.codigo} · ${comercio.nombre}` : "Comercio dado de baja",
        detalle: `${pedidos} ${pedidos === 1 ? "pedido" : "pedidos"}`,
        valor: pedidos,
      };
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const porProducto = new Map<string, number>();
  for (const item of items) {
    porProducto.set(item.producto_id, (porProducto.get(item.producto_id) ?? 0) + Number(item.cantidad));
  }
  const topProductos: FilaRanking[] = [...porProducto.entries()]
    .map(([id, cantidad]) => {
      const producto = (productos ?? []).find((p) => p.id === id);
      return {
        id,
        nombre: producto?.nombre ?? "Producto dado de baja",
        detalle: `${formatearCantidad(cantidad)} ${producto?.unidad_medida ?? ""}`,
        valor: cantidad,
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
        <p className="text-sm text-stone-500">
          Qué moviste este mes. Cuenta los pedidos entregados.
        </p>
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
          <p className="text-xs text-stone-500">Pedidos entregados</p>
          <p className="text-lg font-semibold text-stone-900">{entregados.length}</p>
          {sinEntregar > 0 ? (
            <p className="text-xs text-stone-500">{sinEntregar} sin entregar todavía</p>
          ) : null}
        </div>
        <div>
          <p className="text-xs text-stone-500">Comercios distintos</p>
          <p className="text-lg font-semibold text-stone-900">{topComercios.length}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Visitas</p>
          <p className="text-lg font-semibold text-stone-900">{visitas ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Tu comisión</p>
          <p className="text-lg font-semibold text-stone-900">{formatearComision(comisionPct)}</p>
          <p className="text-xs text-stone-500">sobre lo que entregás</p>
        </div>
      </div>

      <div className={`${estilos.tarjeta} space-y-3 p-4`}>
        <p className="text-sm font-medium text-stone-900">A quién le vendiste más seguido</p>
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
