import Link from "next/link";
import { notFound } from "next/navigation";
import { FormularioPedido } from "@/components/formulario-pedido";
import { estilos } from "@/components/ui";
import { requerirVendedor } from "@/lib/auth";
import { esDeHoy } from "@/lib/fechas";
import { formatearCantidad, formatearFechaHora, formatearPrecio } from "@/lib/formato";
import { actualizarPedido } from "../actions";
import { BotonAnular } from "./boton-anular";

export default async function PaginaMiPedido({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requerirVendedor();
  const { id } = await params;

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, comercio_id, fecha, total")
    .eq("id", id)
    .eq("vendedor_id", userId)
    .maybeSingle();

  if (!pedido) notFound();

  const [{ data: comercio }, { data: items }, { data: productos }] = await Promise.all([
    supabase.from("comercios").select("codigo, nombre, localidad").eq("id", pedido.comercio_id).maybeSingle(),
    supabase.from("pedido_items").select("producto_id, cantidad").eq("pedido_id", id),
    supabase.from("productos").select("id, nombre, precio, unidad_medida, activo").order("nombre"),
  ]);

  const editable = esDeHoy(pedido.fecha);
  const productosActivos = (productos ?? []).filter((producto) => producto.activo);

  const cantidadesIniciales: Record<string, string> = {};
  for (const item of items ?? []) {
    cantidadesIniciales[item.producto_id] = String(Number(item.cantidad));
  }

  return (
    <>
      <div>
        <Link href="/mis-pedidos" className="text-sm text-stone-500 underline">
          ← Mis pedidos
        </Link>
        <h1 className="text-lg font-semibold text-stone-900">
          {comercio ? comercio.nombre : "Comercio eliminado"}
        </h1>
        <p className="text-sm text-stone-500">{formatearFechaHora(pedido.fecha)}</p>
      </div>

      {editable ? (
        <>
          <p className="text-sm text-stone-600">
            Corregí las cantidades y guardá. Poné 0 (o borrá el número) en lo que no va.
          </p>
          <FormularioPedido
            productos={productosActivos}
            cantidadesIniciales={cantidadesIniciales}
            textoBoton="Guardar cambios"
            destino="/mis-pedidos"
            onGuardar={actualizarPedido.bind(null, pedido.id)}
          />

          <div className={`${estilos.tarjeta} space-y-3 p-4`}>
            <div>
              <p className="text-sm font-medium text-stone-900">Anular el pedido</p>
              <p className="text-sm text-stone-500">
                Lo borra entero. La visita al comercio queda registrada igual.
              </p>
            </div>
            <BotonAnular id={pedido.id} />
          </div>
        </>
      ) : (
        <div className={`${estilos.tarjeta} space-y-2 p-4`}>
          <p className="text-sm text-stone-500">
            Este pedido es de un día anterior, así que ya no se puede tocar. Si hay que corregirlo,
            avisale al administrador.
          </p>
          <ul className="space-y-0.5 text-sm text-stone-700">
            {(items ?? []).map((item) => {
              const producto = (productos ?? []).find((p) => p.id === item.producto_id);
              return (
                <li key={item.producto_id}>
                  {formatearCantidad(item.cantidad)} {producto?.unidad_medida ?? ""} de{" "}
                  {producto?.nombre ?? "producto eliminado"}
                </li>
              );
            })}
          </ul>
          <p className="pt-2 text-sm font-medium text-stone-900">
            Total: {formatearPrecio(Number(pedido.total))}
          </p>
        </div>
      )}
    </>
  );
}
