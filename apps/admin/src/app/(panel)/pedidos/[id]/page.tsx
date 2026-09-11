import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoVacio, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { formatearCantidad, formatearFechaHora, formatearPrecio } from "@/lib/formato";

export default async function PaginaPedido({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requerirAdmin();
  const { id } = await params;

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, comercio_id, vendedor_id, fecha, total")
    .eq("id", id)
    .maybeSingle();

  if (!pedido) notFound();

  const [{ data: comercio }, { data: vendedor }, { data: items }] = await Promise.all([
    supabase.from("comercios").select("codigo, nombre, localidad").eq("id", pedido.comercio_id).maybeSingle(),
    supabase.from("usuarios").select("nombre, comision_pct").eq("id", pedido.vendedor_id).maybeSingle(),
    supabase.from("pedido_items").select("producto_id, cantidad, precio_unitario, subtotal").eq("pedido_id", id),
  ]);

  const { data: productos } = await supabase
    .from("productos")
    .select("id, nombre, unidad_medida")
    .in("id", (items ?? []).map((item) => item.producto_id));

  return (
    <>
      <div>
        <Link href="/pedidos" className="text-sm text-stone-500 underline hover:text-stone-900">
          ← Pedidos
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">
          {comercio ? `${comercio.codigo} · ${comercio.nombre}` : "Comercio eliminado"}
        </h1>
        <p className="text-sm text-stone-500">{formatearFechaHora(pedido.fecha)}</p>
      </div>

      <div className={`${estilos.tarjeta} space-y-2 p-5 text-sm`}>
        <p>
          <span className="text-stone-500">Vendedor: </span>
          {vendedor?.nombre ?? "Usuario eliminado"}
        </p>
        {comercio?.localidad ? (
          <p>
            <span className="text-stone-500">Localidad: </span>
            {comercio.localidad}
          </p>
        ) : null}
      </div>

      <div className={`${estilos.tarjeta} overflow-hidden`}>
        {(items ?? []).length === 0 ? (
          <EstadoVacio>Este pedido no tiene ítems.</EstadoVacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  <th className={estilos.encabezadoCelda}>Producto</th>
                  <th className={estilos.encabezadoCelda}>Cantidad</th>
                  <th className={estilos.encabezadoCelda}>Precio unitario</th>
                  <th className={estilos.encabezadoCelda}>Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {(items ?? []).map((item) => {
                  const producto = (productos ?? []).find((p) => p.id === item.producto_id);
                  return (
                    <tr key={item.producto_id}>
                      <td className={`${estilos.celda} font-medium text-stone-900`}>
                        {producto?.nombre ?? "Producto eliminado"}
                      </td>
                      <td className={estilos.celda}>
                        {formatearCantidad(item.cantidad)} {producto?.unidad_medida ?? ""}
                      </td>
                      <td className={estilos.celda}>{formatearPrecio(item.precio_unitario)}</td>
                      <td className={estilos.celda}>{formatearPrecio(item.subtotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`${estilos.tarjeta} flex items-center justify-between p-5`}>
        <span className="text-sm font-medium text-stone-900">Total del pedido</span>
        <span className="text-lg font-semibold text-stone-900">{formatearPrecio(pedido.total)}</span>
      </div>
    </>
  );
}
