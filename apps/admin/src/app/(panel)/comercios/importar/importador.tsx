"use client";

import { useState, type ChangeEvent } from "react";
import type { ResultadoImportacion } from "@lbm/shared";
import { Mensaje, estilos } from "@/components/ui";
import { confirmarImportacion, previsualizarCsv, type ResultadoImport } from "./actions";

const FILAS_EN_PREVIA = 20;

export function ImportadorCsv() {
  const [contenido, setContenido] = useState<string | null>(null);
  const [previa, setPrevia] = useState<ResultadoImportacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function alElegirArchivo(evento: ChangeEvent<HTMLInputElement>) {
    setPrevia(null);
    setResultado(null);
    setContenido(null);

    const archivo = evento.target.files?.[0];
    if (!archivo) return;

    setOcupado(true);
    try {
      const texto = await archivo.text();
      setPrevia(await previsualizarCsv(texto));
      setContenido(texto);
    } finally {
      setOcupado(false);
    }
  }

  async function alConfirmar() {
    if (!contenido) return;

    setOcupado(true);
    try {
      setResultado(await confirmarImportacion(contenido));
      setPrevia(null);
      setContenido(null);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={`${estilos.tarjeta} space-y-3 p-5`}>
        <p className="text-sm text-stone-600">
          El archivo tiene que ser un CSV con las columnas{" "}
          <code className="rounded bg-stone-100 px-1">codigo,nombre,localidad</code>. Los códigos se
          guardan en mayúsculas y, si uno ya existe, se actualizan su nombre y localidad (no se
          duplica ni se reactiva un comercio dado de baja).
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={alElegirArchivo}
          disabled={ocupado}
          className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-md file:border-0 file:bg-stone-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-stone-700"
        />
      </div>

      {resultado?.error ? <Mensaje tipo="error">{resultado.error}</Mensaje> : null}
      {resultado && !resultado.error ? (
        <Mensaje tipo="ok">
          Listo: {resultado.importados} comercio(s) importado(s) o actualizado(s).
        </Mensaje>
      ) : null}

      {previa ? (
        <div className="space-y-4">
          {previa.errores.length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                {previa.errores.length} fila(s) se van a saltear:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-800">
                {previa.errores.map((error) => (
                  <li key={error}>• {error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {previa.validas.length > 0 ? (
            <div className={`${estilos.tarjeta} overflow-hidden`}>
              <div className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700">
                {previa.validas.length} comercio(s) para importar
                {previa.validas.length > FILAS_EN_PREVIA
                  ? ` (se muestran los primeros ${FILAS_EN_PREVIA})`
                  : ""}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] border-collapse">
                  <thead className="border-b border-stone-200">
                    <tr>
                      <th className={estilos.encabezadoCelda}>Código</th>
                      <th className={estilos.encabezadoCelda}>Nombre</th>
                      <th className={estilos.encabezadoCelda}>Localidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {previa.validas.slice(0, FILAS_EN_PREVIA).map((fila) => (
                      <tr key={fila.codigo}>
                        <td className={`${estilos.celda} font-medium text-stone-900`}>
                          {fila.codigo}
                        </td>
                        <td className={estilos.celda}>{fila.nombre}</td>
                        <td className={estilos.celda}>{fila.localidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={alConfirmar}
            disabled={ocupado || previa.validas.length === 0}
            className={estilos.boton}
          >
            {ocupado ? "Importando…" : `Importar ${previa.validas.length} comercio(s)`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
