import Link from "next/link";
import { Tabla } from "@/components/tabla";
import { EstadoVacio, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { mesDesdeValor, ultimosMeses } from "@/lib/fechas";
import { formatearFechaHora, formatearPrecio } from "@/lib/formato";

export default async function PaginaPedidos({
  searchParams,
}: {
  searchParams: Promise<{ vendedor?: string; desde?: string; hasta?: string; mes?: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { vendedor, mes } = await searchParams;
  let { desde, hasta } = await searchParams;

  // El registro mensual: elegir un mes pisa cualquier Desde/Hasta escrito a
  // mano, para no tener dos filtros de fecha compitiendo a la vez.
  if (mes) {
    const rango = mesDesdeValor(mes);
    desde = rango.desde;
    hasta = rango.hasta;
  }

  const [{ data: vendedores }, { data: comercios }] = await Promise.all([
    supabase.from("usuarios").select("id, nombre").eq("rol", "vendedor").order("nombre"),
    supabase.from("comercios").select("id, codigo, nombre"),
  ]);

  let consulta = supabase
    .from("pedidos")
    .select("id, comercio_id, vendedor_id, fecha, total, corregido_en")
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

  const hayFiltro = Boolean(vendedor || desde || hasta || mes);

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
          <span className={estilos.etiqueta}>Mes</span>
          <select name="mes" defaultValue={mes ?? ""} className={estilos.input}>
            <option value="">Elegir un mes…</option>
            {ultimosMeses(12).map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
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
        {hayFiltro ? (
          <Link href="/pedidos" className="text-sm text-stone-500 underline hover:text-stone-900">
            Sacar filtros
          </Link>
        ) : null}
      </form>
      {mes ? (
        <p className="text-xs text-stone-500">
          Mostrando el mes elegido: se ignoran Desde/Hasta si también están cargados.
        </p>
      ) : null}

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
                    {pedido.corregido_en ? (
                      <span className="ml-1.5 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 align-middle">
                        corregido
                      </span>
                    ) : null}
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
