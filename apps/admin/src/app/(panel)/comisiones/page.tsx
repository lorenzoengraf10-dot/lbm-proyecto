import Link from "next/link";
import { EstadoVacio, Etiqueta, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { formatearComision, formatearPrecio } from "@/lib/formato";

export default async function PaginaComisiones({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { desde, hasta } = await searchParams;

  const [{ data: vendedores }, consultaPedidos] = await Promise.all([
    supabase.from("usuarios").select("id, nombre, comision_pct, activo").eq("rol", "vendedor").order("nombre"),
    (() => {
      let consulta = supabase.from("pedidos").select("vendedor_id, total");
      if (desde) consulta = consulta.gte("fecha", desde);
      if (hasta) consulta = consulta.lte("fecha", `${hasta}T23:59:59`);
      return consulta;
    })(),
  ]);

  const { data: pedidos, error } = consultaPedidos;

  // pedidos.total es numeric(10,2): PostgREST lo manda como string ("6400.00")
  // para no perder precisión. Sumarlo con + sin convertir concatenaría texto
  // en vez de sumar números.
  const porVendedor = new Map<string, { cantidad: number; totalVendido: number }>();
  for (const pedido of pedidos ?? []) {
    const actual = porVendedor.get(pedido.vendedor_id) ?? { cantidad: 0, totalVendido: 0 };
    actual.cantidad += 1;
    actual.totalVendido += Number(pedido.total);
    porVendedor.set(pedido.vendedor_id, actual);
  }

  const filas = (vendedores ?? []).map((v) => {
    const resumen = porVendedor.get(v.id) ?? { cantidad: 0, totalVendido: 0 };
    return {
      ...v,
      ...resumen,
      comision: (resumen.totalVendido * Number(v.comision_pct)) / 100,
    };
  });

  const totalGeneral = filas.reduce((acumulado, fila) => acumulado + fila.totalVendido, 0);
  const comisionGeneral = filas.reduce((acumulado, fila) => acumulado + fila.comision, 0);

  return (
    <>
      <h1 className="text-xl font-semibold text-stone-900">Comisiones</h1>

      <form className="flex flex-wrap items-end gap-3">
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
        {desde || hasta ? (
          <Link href="/comisiones" className="text-sm text-stone-500 underline hover:text-stone-900">
            Sacar filtros
          </Link>
        ) : null}
        <span className="text-sm text-stone-500">
          {desde || hasta ? "" : "Sin filtro: totales de todo el historial."}
        </span>
      </form>

      <div className={`${estilos.tarjeta} overflow-hidden`}>
        {error ? (
          <EstadoVacio>No se pudieron cargar los pedidos: {error.message}</EstadoVacio>
        ) : filas.length === 0 ? (
          <EstadoVacio>Todavía no hay vendedores cargados.</EstadoVacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  <th className={estilos.encabezadoCelda}>Vendedor</th>
                  <th className={estilos.encabezadoCelda}>Comisión</th>
                  <th className={estilos.encabezadoCelda}>Pedidos</th>
                  <th className={estilos.encabezadoCelda}>Total vendido</th>
                  <th className={estilos.encabezadoCelda}>A pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filas.map((fila) => (
                  <tr key={fila.id}>
                    <td className={`${estilos.celda} font-medium text-stone-900`}>
                      {fila.nombre} {fila.activo ? null : <Etiqueta activo={false} />}
                    </td>
                    <td className={estilos.celda}>{formatearComision(fila.comision_pct)}</td>
                    <td className={estilos.celda}>{fila.cantidad}</td>
                    <td className={estilos.celda}>{formatearPrecio(fila.totalVendido)}</td>
                    <td className={`${estilos.celda} font-medium text-stone-900`}>
                      {formatearPrecio(fila.comision)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-stone-200 bg-stone-50">
                <tr>
                  <td className={`${estilos.celda} font-semibold text-stone-900`} colSpan={3}>
                    Total
                  </td>
                  <td className={`${estilos.celda} font-semibold text-stone-900`}>
                    {formatearPrecio(totalGeneral)}
                  </td>
                  <td className={`${estilos.celda} font-semibold text-stone-900`}>
                    {formatearPrecio(comisionGeneral)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
