import Link from "next/link";
import { notFound } from "next/navigation";
import { Desplegable } from "@/components/desplegable";
import { EstadoVacio, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { formatearCantidad, formatearComision, formatearFechaHora, formatearPrecio } from "@/lib/formato";
import { corregirPedido } from "./actions";
import { PanelEstado } from "./panel-estado";
import { FormularioCorreccion } from "./formulario-correccion";

export default async function PaginaPedido({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requerirAdmin();
  const { id } = await params;

  const { data: pedido } = await supabase
    .from("pedidos")
    .select(
      "id, comercio_id, vendedor_id, fecha, total, corregido_en, corregido_por, motivo_correccion, estado, forma_pago, cobrado_en, comision_pct"
    )
    .eq("id", id)
    .maybeSingle();

  if (!pedido) notFound();

  const [{ data: comercio }, { data: vendedor }, { data: items }, { data: corrector }, { data: catalogo }] =
    await Promise.all([
      supabase.from("comercios").select("codigo, nombre, localidad").eq("id", pedido.comercio_id).maybeSingle(),
      supabase.from("usuarios").select("nombre, comision_pct").eq("id", pedido.vendedor_id).maybeSingle(),
      supabase.from("pedido_items").select("producto_id, cantidad, precio_unitario, subtotal").eq("pedido_id", id),
      pedido.corregido_por
        ? supabase.from("usuarios").select("nombre").eq("id", pedido.corregido_por).maybeSingle()
        : Promise.resolve({ data: null }),
      // Todo el catálogo, activo o no: un pedido viejo puede tener un
      // producto ya dado de baja, y hay que poder seguir viendo esa línea.
      supabase.from("productos").select("id, nombre, precio, unidad_medida, activo").order("nombre"),
    ]);

  const productos = catalogo ?? [];

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

      <PanelEstado
        pedidoId={pedido.id}
        estado={pedido.estado}
        formaPago={pedido.forma_pago}
        cobradoEn={pedido.cobrado_en}
      />

      {pedido.corregido_en ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span className="font-medium">
            ✎ Corregido por {corrector?.nombre ?? "un administrador"} el{" "}
            {formatearFechaHora(pedido.corregido_en)}.
          </span>{" "}
          {pedido.motivo_correccion}
        </div>
      ) : null}

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
                  const producto = productos.find((p) => p.id === item.producto_id);
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

      <div className={`${estilos.tarjeta} space-y-2 p-5`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-stone-900">Total del pedido</span>
          <span className="text-lg font-semibold text-stone-900">{formatearPrecio(pedido.total)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-stone-500">
          <span>
            Comisión de {vendedor?.nombre ?? "el vendedor"} ({formatearComision(pedido.comision_pct)})
            {Number(pedido.comision_pct) !== Number(vendedor?.comision_pct ?? pedido.comision_pct) ? (
              <span className="text-stone-400">
                {" "}
                · hoy cobra {formatearComision(vendedor?.comision_pct ?? 0)}
              </span>
            ) : null}
          </span>
          <span>
            {formatearPrecio((Number(pedido.total) * Number(pedido.comision_pct)) / 100)}
            {pedido.estado === "completado" ? "" : " (cuando se entregue)"}
          </span>
        </div>
      </div>

      <Desplegable titulo="Corregir este pedido">
        <p className="mb-4 text-sm text-stone-500">
          Cambiá las cantidades o el precio de lo que se cargó mal. Los productos en 0 quedan afuera
          del pedido; el total y la comisión se recalculan solos al guardar.
        </p>
        <FormularioCorreccion
          pedidoId={pedido.id}
          accion={corregirPedido}
          productos={productos.map((producto) => {
            const item = (items ?? []).find((i) => i.producto_id === producto.id);
            return {
              id: producto.id,
              nombre: producto.nombre,
              unidad_medida: producto.unidad_medida,
              activo: producto.activo,
              precio: Number(producto.precio),
              cantidadActual: item ? String(Number(item.cantidad)) : "",
              precioActual: item ? String(Number(item.precio_unitario)) : String(Number(producto.precio)),
            };
          })}
        />
      </Desplegable>
    </>
  );
}
