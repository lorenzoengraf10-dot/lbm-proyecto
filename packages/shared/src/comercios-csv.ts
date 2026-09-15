import { parse } from "csv-parse/sync";
import { normalizarCodigoComercio, validarCodigoComercio } from "./comercios";
import type { ComercioImportRow } from "./types";

export interface ResultadoImportacion {
  validas: ComercioImportRow[];
  errores: string[];
}

/** Una fila tal como viene del archivo, antes de validar nada. */
export interface FilaComercio {
  codigo?: string;
  nombre?: string;
  localidad?: string;
  direccion?: string;
  zona?: string;
}

// Lo mínimo que tiene que traer el archivo. La localidad, la dirección y la
// zona son opcionales: la mayoría de los comercios de la cartera están en la
// misma localidad, así que se completa una sola vez en la pantalla de
// importación en vez de repetirla en cada fila.
export const COLUMNAS_CSV_COMERCIOS = ["codigo", "nombre"] as const;

/** Lo más largo que la base acepta en cada campo de texto opcional. */
const LARGO_DIRECCION = 120;
const LARGO_ZONA = 40;

/**
 * Valida y limpia las filas de un archivo, venga de un CSV o de un Excel.
 *
 * @param localidadPorDefecto la que se usa en las filas que no traen una.
 * @param numeroDeFila con qué número nombrar cada fila en los errores. Por
 *   defecto, la posición contando el encabezado como fila 1 — que es lo que
 *   pasa en un CSV. Un Excel puede tener un título arriba y filas vacías en el
 *   medio, así que pasa el número real de la planilla para que el mensaje
 *   señale la fila que el dueño ve en pantalla.
 */
export function normalizarFilasComercios(
  filas: FilaComercio[],
  localidadPorDefecto = "",
  numeroDeFila: (indice: number) => number = (indice) => indice + 2
): ResultadoImportacion {
  const validas: ComercioImportRow[] = [];
  const errores: string[] = [];
  const codigosVistos = new Map<string, number>();

  filas.forEach((fila, indice) => {
    const numeroFila = numeroDeFila(indice);
    const codigo = normalizarCodigoComercio(fila.codigo ?? "");
    const nombre = fila.nombre?.trim();
    const localidad = fila.localidad?.trim() || localidadPorDefecto.trim();
    // Se recortan al largo que acepta la base en vez de rechazar la fila: una
    // dirección larga de más es un detalle, y perder el comercio entero por
    // eso sería peor que guardarlo con la dirección cortada.
    const direccion = fila.direccion?.trim().slice(0, LARGO_DIRECCION);
    const zona = fila.zona?.trim().slice(0, LARGO_ZONA);

    if (!codigo || !nombre) {
      errores.push(`Fila ${numeroFila}: faltan el código o el nombre — ${JSON.stringify(fila)}`);
      return;
    }

    if (!localidad) {
      errores.push(
        `Fila ${numeroFila}: falta la localidad. Poné una abajo para usar en todas, o agregá la columna al archivo.`
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
    validas.push({ codigo, nombre, localidad, direccion: direccion || null, zona: zona || null });
  });

  return { validas, errores };
}

export function parsearCsvComercios(
  contenido: string,
  localidadPorDefecto = ""
): ResultadoImportacion {
  let filas: FilaComercio[];

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
        `Al archivo le faltan columnas: ${columnasFaltantes.join(", ")}. ` +
          `Se esperan al menos ${COLUMNAS_CSV_COMERCIOS.join(" y ")} (localidad, direccion y zona son opcionales).`,
      ],
    };
  }

  return normalizarFilasComercios(filas, localidadPorDefecto);
}
