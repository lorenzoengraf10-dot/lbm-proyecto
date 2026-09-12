"use client";

import { useState, type ChangeEvent } from "react";
import type { ResultadoImportacion } from "@lbm/shared";
import { Mensaje, estilos } from "@/components/ui";
import {
  confirmarImportacion,
  previsualizarArchivo,
  type ArchivoImportado,
  type ResultadoImport,
} from "./actions";

const FILAS_EN_PREVIA = 20;

/** Lee el archivo del disco y lo deja listo para mandar al servidor. */
async function leerArchivo(archivo: File, localidadPorDefecto: string): Promise<ArchivoImportado> {
  const esExcel = /\.xlsx?$/i.test(archivo.name);

  if (!esExcel) {
    return { tipo: "csv", contenido: await archivo.text(), localidadPorDefecto };
  }

  // Un Excel es binario: viaja en base64. Se arma de a pedazos porque
  // String.fromCharCode con un archivo entero se pasa del límite de argumentos.
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return { tipo: "excel", contenido: btoa(binario), localidadPorDefecto };
}

export function ImportadorCsv() {
  const [archivo, setArchivo] = useState<ArchivoImportado | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [localidad, setLocalidad] = useState("Carmen de Patagones");
  const [previa, setPrevia] = useState<ResultadoImportacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function alElegirArchivo(evento: ChangeEvent<HTMLInputElement>) {
    setPrevia(null);
    setResultado(null);
    setArchivo(null);

    const elegido = evento.target.files?.[0];
    if (!elegido) return;

    setOcupado(true);
    try {
      const leido = await leerArchivo(elegido, localidad);
      setNombreArchivo(elegido.name);
      setPrevia(await previsualizarArchivo(leido));
      setArchivo(leido);
    } finally {
      setOcupado(false);
    }
  }

  // Cambiar la localidad después de elegir el archivo tiene que rehacer la
  // previsualización: si no, lo que se ve y lo que se importa no coinciden.
  async function alCambiarLocalidad(nueva: string) {
    setLocalidad(nueva);
    if (!archivo) return;

    const actualizado = { ...archivo, localidadPorDefecto: nueva };
    setArchivo(actualizado);
    setOcupado(true);
    try {
      setPrevia(await previsualizarArchivo(actualizado));
    } finally {
      setOcupado(false);
    }
  }

  async function alConfirmar() {
    if (!archivo) return;

    setOcupado(true);
    try {
      setResultado(await confirmarImportacion(archivo));
      setPrevia(null);
      setArchivo(null);
      setNombreArchivo("");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={`${estilos.tarjeta} space-y-4 p-5`}>
        <p className="text-sm text-stone-600">
          Sirve un <strong>Excel</strong> (.xlsx) o un CSV con las columnas{" "}
          <code className="rounded bg-stone-100 px-1">codigo</code>,{" "}
          <code className="rounded bg-stone-100 px-1">nombre</code> y{" "}
          <code className="rounded bg-stone-100 px-1">telefono</code>. Los códigos se guardan en
          mayúsculas y, si uno ya existe, se actualizan sus datos (no se duplica ni se reactiva un
          comercio dado de baja).
        </p>

        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Localidad</span>
          <input
            value={localidad}
            onChange={(evento) => void alCambiarLocalidad(evento.target.value)}
            disabled={ocupado}
            className={`${estilos.input} max-w-xs`}
          />
          <span className="block text-xs text-stone-500">
            Se usa para todos los comercios del archivo. Si el archivo trae una columna{" "}
            <code className="rounded bg-stone-100 px-1">localidad</code>, esa manda.
          </span>
        </label>

        <input
          type="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={alElegirArchivo}
          disabled={ocupado}
          className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-md file:border-0 file:bg-stone-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-stone-700"
        />
        {nombreArchivo ? (
          <p className="text-xs text-stone-500">Archivo elegido: {nombreArchivo}</p>
        ) : null}
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
                <table className="w-full min-w-[34rem] border-collapse">
                  <thead className="border-b border-stone-200">
                    <tr>
                      <th className={estilos.encabezadoCelda}>Código</th>
                      <th className={estilos.encabezadoCelda}>Nombre</th>
                      <th className={estilos.encabezadoCelda}>Teléfono</th>
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
                        <td className={estilos.celda}>{fila.telefono || "—"}</td>
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
