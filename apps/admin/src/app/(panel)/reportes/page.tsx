import { EstadoVacio, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { formatearCantidad, formatearComision, formatearPrecio } from "@/lib/formato";
import { armarReporteSemanal } from "@/lib/reporte-semanal";
import { etiquetaSemana, lunesDe, semanaActual, semanaDesdeLunes, ultimasSemanas } from "@/lib/semana";

export default async function PaginaReportes({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { semana: semanaPedida } = await searchParams;

  const semana = semanaPedida ? semanaDesdeLunes(lunesDe(semanaPedida)) : semanaActual();
  const reporte = await armarReporteSemanal(supabase, semana);
  const opciones = ultimasSemanas(12);
  const esSemanaActual = semana.lunes === semanaActual().lunes;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Reporte semanal</h1>
        <p className="text-sm text-stone-500">
          Semana de lunes a domingo. {esSemanaActual ? "La semana en curso va cambiando." : null}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Semana</span>
          <select name="semana" defaultValue={semana.lunes} className={estilos.input}>
            {opciones.map((opcion, i) => (
              <option key={opcion.lunes} value={opcion.lunes}>
                {etiquetaSemana(opcion)}
                {i === 0 ? " (en curso)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={estilos.botonSecundario}>
          Ver
        </button>
        <a href={`/reportes/semanal?semana=${semana.lunes}`} className={estilos.boton}>
          Descargar PDF
        </a>
      </form>

      <div className={`${estilos.tarjeta} grid gap-4 p-5 sm:grid-cols-3`}>
        <div>
          <p className="text-sm text-stone-500">Total facturado</p>
          <p className="text-lg font-semibold text-stone-900">
            {formatearPrecio(reporte.totalFacturado)}
          </p>
        </div>
        <div>
          <p className="text-sm text-stone-500">Pedidos</p>
          <p className="text-lg font-semibold text-stone-900">{reporte.cantidadPedidos}</p>
        </div>
        <div>
          <p className="text-sm text-stone-500">Comisiones a pagar</p>
          <p className="text-lg font-semibold text-stone-900">
            {formatearPrecio(reporte.totalComisiones)}
          </p>
        </div>
      </div>

      <div className={`${estilos.tarjeta} overflow-hidden`}>
        <p className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-900">
          Por vendedor
        </p>
        {reporte.vendedores.length === 0 ? (
          <EstadoVacio>Sin ventas en esta semana.</EstadoVacio>
        ) : (
          <table className="w-full border-collapse">
            <tbody className="divide-y divide-stone-100">
              {reporte.vendedores.map((fila) => (
                <tr key={fila.nombre}>
                  <td className={`${estilos.celda} font-medium text-stone-900`}>{fila.nombre}</td>
                  <td className={estilos.celda}>{fila.pedidos} pedidos</td>
                  <td className={estilos.celda}>{formatearPrecio(fila.totalVendido)}</td>
                  <td className={`${estilos.celda} font-medium text-stone-900`}>
                    {formatearPrecio(fila.comision)} ({formatearComision(fila.comisionPct)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={`${estilos.tarjeta} overflow-hidden`}>
        <p className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-900">
          Por producto
        </p>
        {reporte.productos.length === 0 ? (
          <EstadoVacio>Sin ventas en esta semana.</EstadoVacio>
        ) : (
          <table className="w-full border-collapse">
            <tbody className="divide-y divide-stone-100">
              {reporte.productos.map((fila) => (
                <tr key={fila.nombre}>
                  <td className={`${estilos.celda} font-medium text-stone-900`}>{fila.nombre}</td>
                  <td className={estilos.celda}>
                    {formatearCantidad(fila.cantidad)} {fila.unidad}
                  </td>
                  <td className={estilos.celda}>{formatearPrecio(fila.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={`${estilos.tarjeta} space-y-2 p-5`}>
        <p className="text-sm font-semibold text-stone-900">Cobertura</p>
        <p className="text-sm text-stone-600">
          {reporte.cobertura.visitados} de {reporte.cobertura.activos} comercios visitados ·{" "}
          {reporte.cobertura.visitas} visitas registradas
        </p>
        {reporte.cobertura.noVisitados.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-sm text-stone-600 underline">
              Ver los {reporte.cobertura.noVisitados.length} sin visitar
            </summary>
            <ul className="mt-2 space-y-0.5 text-sm text-stone-600">
              {reporte.cobertura.noVisitados.map((comercio) => (
                <li key={comercio.codigo}>
                  {comercio.codigo} · {comercio.nombre}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </>
  );
}
