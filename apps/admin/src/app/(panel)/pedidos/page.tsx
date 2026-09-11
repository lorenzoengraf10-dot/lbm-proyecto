import Link from "next/link";
import { Tabla } from "@/components/tabla";
import { EstadoVacio, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { formatearFechaHora, formatearPrecio } from "@/lib/formato";

export default async function PaginaPedidos({
  searchParams,
}: {
  searchParams: Promise<{ vendedor?: string; desde?: string; hasta?: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { vendedor, desde, hasta } = await searchParams;

  const [{ data: vendedores }, { data: comercios }] = await Promise.all([
    supabase.from("usuarios").select("id, nombre").eq("rol", "vendedor").order("nombre"),
    supabase.from("comercios").select("id, codigo, nombre"),
  ]);

  let consulta = supabase
    .from("pedidos")
    .select("id, comercio_id, vendedor_id, fecha, total")
    .order("fecha", { ascending: false });

  if (vendedor) consulta = consulta.eq("vendedor_id", vendedor);
  if (desde) consulta = consulta.gte("fecha", desde);
  if (hasta) consulta = consulta.lte("fecha", `${hasta}T23:59:59`);

  const { data: pedidos, error } = await consulta;

  // pedidos.total es numeric(10,2): PostgREST lo manda como string ("6400.00")
  // para no perder precisión. Sumarlo con + sin convertir concatenaría texto
  // en vez de sumar números.
  const totalPeriodo = (pedidos ?? []).reduce(
    (acumulado, pedido) => acumulado + Number(pedido.total),
    0
  );

  return (
    <>
      <h1 className="text-xl font-semibold text-stone-900">Pedidos</h1>

      <form className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Vendedor</span>
          <select name="vendedor" defaultValue={vendedor ?? ""} className={estilos.input}>
            <option value="">Todos</option>
            {(vendedores ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Desde</span>
          <input type="date" name="desde" defaultValue={desde ?? ""} className={estilos.input} />
        </label>

        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta ?? ""} className={estilos.input} />
        </label>

        <button type="submit" className={estilos.botonSecundario}>
          Filtrar
        </button>
        {vendedor || desde || hasta ? (
          <Link href="/pedidos" className="text-sm text-stone-500 underline hover:text-stone-900">
            Sacar filtros
          </Link>
        ) : null}
      </form>

      {error ? (
        <div className={`${estilos.tarjeta} overflow-hidden`}>
          <EstadoVacio>No se pudieron cargar los pedidos: {error.message}</EstadoVacio>
        </div>
      ) : (
        <Tabla
          filas={pedidos ?? []}
          clave={(pedido) => pedido.id}
          vacio="No hay pedidos que coincidan con el filtro."
          columnas={[
            {
              encabezado: "Comercio",
              principal: true,
              celda: (pedido) => {
                const comercio = (comercios ?? []).find((c) => c.id === pedido.comercio_id);
                return (
                  <Link href={`/pedidos/${pedido.id}`} className="hover:underline">
                    {comercio ? `${comercio.codigo} · ${comercio.nombre}` : "—"}
                  </Link>
                );
              },
            },
            { encabezado: "Fecha", celda: (pedido) => formatearFechaHora(pedido.fecha) },
            {
              encabezado: "Vendedor",
              celda: (pedido) =>
                (vendedores ?? []).find((v) => v.id === pedido.vendedor_id)?.nombre ?? "—",
            },
            { encabezado: "Total", celda: (pedido) => formatearPrecio(Number(pedido.total)) },
          ]}
        />
      )}

      <p className="text-sm text-stone-500">
        {(pedidos ?? []).length} pedidos · {formatearPrecio(totalPeriodo)} en total
      </p>
    </>
  );
}
