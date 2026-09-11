import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoVacio, estilos } from "@/components/ui";
import { requerirVendedor } from "@/lib/auth";
import { formatearCantidad, formatearFechaHora, formatearPrecio } from "@/lib/formato";
import { registrarVisitaManualDesdeForm } from "../actions";
import { FormularioPedido } from "./formulario-pedido";

export default async function PaginaComercio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ visita?: string }>;
}) {
  const { supabase, userId } = await requerirVendedor();
  const { id } = await params;
  const { visita } = await searchParams;

  const { data: comercio } = await supabase
    .from("comercios")
    .select("id, codigo, nombre, localidad, telefono")
    .eq("id", id)
    .eq("activo", true)
    .maybeSingle();

  if (!comercio) notFound();

  const [{ data: productos }, { data: ultimoPedido }] = await Promise.all([
    supabase.from("productos").select("id, nombre, precio, unidad_medida, activo").order("nombre"),
    supabase
      .from("pedidos")
      .select("id, fecha, total")
      .eq("comercio_id", id)
      .eq("vendedor_id", userId)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: itemsUltimoPedido } = ultimoPedido
    ? await supabase.from("pedido_items").select("producto_id, cantidad").eq("pedido_id", ultimoPedido.id)
    : { data: null };

  const productosActivos = (productos ?? []).filter((producto) => producto.activo);

  return (
    <>
      <div>
        <Link href="/comercios" className="text-sm text-stone-500 underline">
          ← Comercios
        </Link>
        <h1 className="text-lg font-semibold text-stone-900">{comercio.nombre}</h1>
        <p className="text-sm text-stone-500">
          {comercio.codigo} · {comercio.localidad}
        </p>
      </div>

      {ultimoPedido ? (
        <div className={`${estilos.tarjeta} p-4`}>
          <p className="text-sm font-medium text-stone-900">Tu último pedido acá</p>
          <p className="mb-2 text-xs text-stone-500">{formatearFechaHora(ultimoPedido.fecha)}</p>
          <ul className="space-y-0.5 text-sm text-stone-700">
            {(itemsUltimoPedido ?? []).map((item) => {
              const producto = (productos ?? []).find((p) => p.id === item.producto_id);
              return (
                <li key={item.producto_id}>
                  {formatearCantidad(item.cantidad)} {producto?.unidad_medida ?? ""} de{" "}
                  {producto?.nombre ?? "producto eliminado"}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-sm font-medium text-stone-900">
            Total: {formatearPrecio(ultimoPedido.total)}
          </p>
        </div>
      ) : (
        <EstadoVacio>Todavía no le cargaste ningún pedido a este comercio.</EstadoVacio>
      )}

      {visita ? (
        <FormularioPedido visitaId={visita} productos={productosActivos} />
      ) : (
        <div className={`${estilos.tarjeta} space-y-3 p-4`}>
          <p className="text-sm text-stone-600">Para cargar un pedido, primero registrá la visita.</p>
          <Link href="/escanear" className={`${estilos.boton} block w-full text-center`}>
            Escanear QR
          </Link>
          <form action={registrarVisitaManualDesdeForm}>
            <input type="hidden" name="comercioId" value={comercio.id} />
            <button type="submit" className="w-full text-center text-sm text-stone-500 underline">
              ¿No podés escanear? Registrar visita a mano
            </button>
          </form>
        </div>
      )}
    </>
  );
}
