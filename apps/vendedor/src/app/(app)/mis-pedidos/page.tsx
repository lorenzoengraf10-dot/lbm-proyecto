import Link from "next/link";
import { EstadoVacio, estilos } from "@/components/ui";
import { requerirVendedor } from "@/lib/auth";
import { esDeHoy } from "@/lib/fechas";
import { formatearFechaHora, formatearPrecio } from "@/lib/formato";
import { PedidosPendientes } from "./pendientes";

export default async function PaginaMisPedidos() {
  const { supabase, userId } = await requerirVendedor();

  // Las dos consultas no dependen una de la otra, así que salen juntas: en el
  // celular, una atrás de la otra eran dos esperas en vez de una.
  const [{ data: pedidos, error }, { data: comercios }] = await Promise.all([
    supabase
      .from("pedidos")
      .select("id, comercio_id, fecha, total")
      .eq("vendedor_id", userId)
      .order("fecha", { ascending: false })
      .limit(50),
    supabase.from("comercios").select("id, codigo, nombre"),
  ]);

  return (
    <>
      <h1 className="text-lg font-semibold text-stone-900">Mis pedidos</h1>
      <p className="text-sm text-stone-500">
        Los de hoy se pueden corregir o anular. Los de días anteriores quedan fijos.
      </p>

      <PedidosPendientes />

      <div className={`${estilos.tarjeta} divide-y divide-stone-100 overflow-hidden`}>
        {error ? (
          <EstadoVacio>No se pudieron cargar los pedidos: {error.message}</EstadoVacio>
        ) : (pedidos ?? []).length === 0 ? (
          <EstadoVacio>Todavía no cargaste ningún pedido.</EstadoVacio>
        ) : (
          (pedidos ?? []).map((pedido) => {
            const comercio = (comercios ?? []).find((c) => c.id === pedido.comercio_id);
            const editable = esDeHoy(pedido.fecha);
            return (
              <Link
                key={pedido.id}
                href={`/mis-pedidos/${pedido.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 active:bg-stone-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-900">
                    {comercio ? comercio.nombre : "Comercio eliminado"}
                  </p>
                  <p className="text-sm text-stone-500">
                    {formatearFechaHora(pedido.fecha)}
                    {editable ? " · se puede corregir" : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-stone-900">
                  {formatearPrecio(Number(pedido.total))}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
