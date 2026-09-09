import { parse } from "csv-parse/sync";
import { normalizarCodigoComercio, validarCodigoComercio } from "./comercios";
import type { ComercioImportRow } from "./types";

export interface ResultadoImportacion {
  validas: ComercioImportRow[];
  errores: string[];
}

interface FilaCsv {
  codigo?: string;
  nombre?: string;
  localidad?: string;
}

export const COLUMNAS_CSV_COMERCIOS = ["codigo", "nombre", "localidad"] as const;

function normalizarFilas(filas: FilaCsv[]): ResultadoImportacion {
  const validas: ComercioImportRow[] = [];
  const errores: string[] = [];
  const codigosVistos = new Map<string, number>();

  filas.forEach((fila, indice) => {
    const numeroFila = indice + 2; // +1 por el header, +1 porque el índice arranca en 0
    const codigo = normalizarCodigoComercio(fila.codigo ?? "");
    const nombre = fila.nombre?.trim();
    const localidad = fila.localidad?.trim();

    if (!codigo || !nombre || !localidad) {
      errores.push(
        `Fila ${numeroFila}: faltan datos (codigo/nombre/localidad) — ${JSON.stringify(fila)}`
      );
      return;
    }

    const errorCodigo = validarCodigoComercio(codigo);
    if (errorCodigo) {
      errores.push(`Fila ${numeroFila}: ${errorCodigo}`);
      return;
    }

    const filaPrevia = codigosVistos.get(codigo);
    if (filaPrevia !== undefined) {
      errores.push(`Fila ${numeroFila}: el código ${codigo} ya aparece en la fila ${filaPrevia}`);
      return;
    }

    codigosVistos.set(codigo, numeroFila);
    validas.push({ codigo, nombre, localidad });
  });

  return { validas, errores };
}

export function parsearCsvComercios(contenido: string): ResultadoImportacion {
  let filas: FilaCsv[];

  try {
    filas = parse(contenido, {
      columns: (headers: string[]) => headers.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (error) {
    return {
      validas: [],
      errores: [`No se pudo leer el CSV: ${error instanceof Error ? error.message : error}`],
    };
  }

  const columnasFaltantes = COLUMNAS_CSV_COMERCIOS.filter(
    (columna) => !filas.some((fila) => columna in fila)
  );

  if (filas.length > 0 && columnasFaltantes.length > 0) {
    return {
      validas: [],
      errores: [
        `Al CSV le faltan columnas: ${columnasFaltantes.join(", ")}. ` +
          `Se esperan las columnas ${COLUMNAS_CSV_COMERCIOS.join(",")}.`,
      ],
    };
  }

  return normalizarFilas(filas);
}
