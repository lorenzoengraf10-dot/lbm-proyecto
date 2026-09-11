import type { ReactNode } from "react";
import { EstadoVacio, estilos } from "./ui";

export interface Columna<T> {
  encabezado: string;
  celda: (fila: T) => ReactNode;
  /** La columna que identifica la fila: en celular es el título de la tarjeta. */
  principal?: boolean;
  /** No se muestra en celular (datos secundarios que solo estorban en pantalla chica). */
  soloEscritorio?: boolean;
}

/** Los totales del final. Se alinean con las últimas columnas de la tabla. */
export interface Total {
  etiqueta: string;
  valor: ReactNode;
}

/**
 * Una tabla en la compu y una lista de tarjetas en el celular, desde la misma
 * definición de columnas. Antes las tablas se salían de la pantalla y había
 * que arrastrarlas de costado para leer una fila entera.
 */
export function Tabla<T>({
  columnas,
  filas,
  clave,
  vacio,
  pie,
}: {
  columnas: Columna<T>[];
  filas: T[];
  clave: (fila: T) => string;
  vacio: ReactNode;
  pie?: Total[];
}) {
  if (filas.length === 0) {
    return (
      <div className={`${estilos.tarjeta} overflow-hidden`}>
        <EstadoVacio>{vacio}</EstadoVacio>
      </div>
    );
  }

  const principal = columnas.find((columna) => columna.principal) ?? columnas[0];
  const secundarias = columnas.filter(
    (columna) => columna !== principal && !columna.soloEscritorio
  );
  const totales = pie ?? [];
  // Los totales van pegados a la derecha: la celda "Total" se estira sobre
  // todas las columnas que quedan libres a la izquierda.
  const anchoEtiqueta = Math.max(1, columnas.length - totales.length);

  return (
    <>
      <div className={`${estilos.tarjeta} hidden overflow-x-auto sm:block`}>
        <table className="w-full border-collapse">
          <thead className="border-b border-stone-200 bg-stone-50">
            <tr>
              {columnas.map((columna) => (
                <th key={columna.encabezado} className={estilos.encabezadoCelda}>
                  {columna.encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filas.map((fila) => (
              <tr key={clave(fila)}>
                {columnas.map((columna) => (
                  <td key={columna.encabezado} className={estilos.celda}>
                    {columna.celda(fila)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totales.length > 0 ? (
            <tfoot className="border-t border-stone-200 bg-stone-50">
              <tr>
                <td className={`${estilos.celda} font-semibold text-stone-900`} colSpan={anchoEtiqueta}>
                  Total
                </td>
                {totales.map((total) => (
                  <td key={total.etiqueta} className={`${estilos.celda} font-semibold text-stone-900`}>
                    {total.valor}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <div className={`${estilos.tarjeta} divide-y divide-stone-100 sm:hidden`}>
        {filas.map((fila) => (
          <div key={clave(fila)} className="space-y-1 px-4 py-3">
            <div className="font-medium text-stone-900">{principal.celda(fila)}</div>
            <dl className="space-y-0.5">
              {secundarias.map((columna) => (
                <div key={columna.encabezado} className="flex justify-between gap-3 text-sm">
                  <dt className="text-stone-500">{columna.encabezado}</dt>
                  <dd className="text-right text-stone-700">{columna.celda(fila)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        {totales.length > 0 ? (
          <dl className="space-y-0.5 bg-stone-50 px-4 py-3">
            {totales.map((total) => (
              <div key={total.etiqueta} className="flex justify-between gap-3 text-sm">
                <dt className="font-semibold text-stone-900">{total.etiqueta}</dt>
                <dd className="text-right font-semibold text-stone-900">{total.valor}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </>
  );
}
