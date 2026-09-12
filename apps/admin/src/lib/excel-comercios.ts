import "server-only";

import ExcelJS from "exceljs";
import {
  normalizarFilasComercios,
  type FilaComercio,
  type ResultadoImportacion,
} from "@lbm/shared";

/**
 * Los nombres que puede tener cada columna en el Excel. El dueño arma la
 * planilla a mano, así que se aceptan las formas razonables (con acento o sin,
 * "tel" o "teléfono") en vez de exigir un encabezado exacto.
 */
const COLUMNAS: Record<keyof FilaComercio, string[]> = {
  codigo: ["codigo", "código", "cod", "cp"],
  nombre: ["nombre", "comercio", "negocio", "razon social", "razón social"],
  localidad: ["localidad", "ciudad", "pueblo", "zona"],
  telefono: ["telefono", "teléfono", "tel", "celular", "whatsapp"],
};

function limpiarEncabezado(valor: string): string {
  return valor.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A qué campo corresponde un encabezado, o null si no es ninguno. */
function campoDe(encabezado: string): keyof FilaComercio | null {
  const limpio = limpiarEncabezado(encabezado);
  for (const [campo, alias] of Object.entries(COLUMNAS)) {
    if (alias.includes(limpio)) return campo as keyof FilaComercio;
  }
  return null;
}

/**
 * Una celda puede venir como texto, número (un teléfono sin el 0, un código
 * que Excel interpretó como número), fórmula o texto con formato. Se la lleva
 * a string en todos los casos.
 */
function textoDeCelda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (valor instanceof Date) return valor.toISOString();

  if (typeof valor === "object") {
    // Fórmula: interesa el resultado, no la fórmula.
    if ("result" in valor) return textoDeCelda(valor.result as ExcelJS.CellValue);
    // Texto con formato: viene partido en pedazos con distinto estilo.
    if ("richText" in valor) {
      return valor.richText.map((parte) => parte.text).join("").trim();
    }
    if ("text" in valor) return String(valor.text).trim();
  }
  return String(valor).trim();
}

/**
 * Lee la primera hoja de un Excel y devuelve los comercios listos para
 * importar. Se espera una fila de encabezados y debajo los datos.
 */
export async function parsearExcelComercios(
  datos: ArrayBuffer,
  localidadPorDefecto = ""
): Promise<ResultadoImportacion> {
  const libro = new ExcelJS.Workbook();

  try {
    await libro.xlsx.load(datos);
  } catch (error) {
    return {
      validas: [],
      errores: [
        `No se pudo leer el Excel: ${error instanceof Error ? error.message : error}. ` +
          "¿Es un archivo .xlsx?",
      ],
    };
  }

  const hoja = libro.worksheets[0];
  if (!hoja) return { validas: [], errores: ["El Excel no tiene ninguna hoja."] };

  // La primera fila con algo escrito es la de los encabezados: una planilla
  // hecha a mano suele tener filas vacías o un título arriba de la tabla.
  let filaEncabezados = 0;
  const porColumna = new Map<number, keyof FilaComercio>();

  for (let numero = 1; numero <= Math.min(hoja.rowCount, 20); numero++) {
    const fila = hoja.getRow(numero);
    const encontrados = new Map<number, keyof FilaComercio>();
    fila.eachCell({ includeEmpty: false }, (celda, columna) => {
      const campo = campoDe(textoDeCelda(celda.value));
      if (campo) encontrados.set(columna, campo);
    });
    // Con el código y el nombre alcanza para saber que ésta es la fila.
    const campos = [...encontrados.values()];
    if (campos.includes("codigo") && campos.includes("nombre")) {
      filaEncabezados = numero;
      for (const [columna, campo] of encontrados) porColumna.set(columna, campo);
      break;
    }
  }

  if (filaEncabezados === 0) {
    return {
      validas: [],
      errores: [
        "No se encontraron las columnas en el Excel. Tiene que haber una fila con los títulos " +
          "codigo y nombre (telefono y localidad son opcionales).",
      ],
    };
  }

  // Se guarda de qué fila de la planilla salió cada una: como las vacías se
  // saltean, la posición en el arreglo no coincide con lo que muestra Excel, y
  // los errores tienen que señalar la fila que el dueño ve.
  const filas: FilaComercio[] = [];
  const numerosDeFila: number[] = [];

  for (let numero = filaEncabezados + 1; numero <= hoja.rowCount; numero++) {
    const fila = hoja.getRow(numero);
    const datosFila: FilaComercio = {};
    for (const [columna, campo] of porColumna) {
      const texto = textoDeCelda(fila.getCell(columna).value);
      if (texto) datosFila[campo] = texto;
    }
    // Las filas del todo vacías se saltean sin avisar: en una planilla a mano
    // siempre sobran, y anunciarlas como error sería solo ruido.
    if (Object.keys(datosFila).length > 0) {
      filas.push(datosFila);
      numerosDeFila.push(numero);
    }
  }

  return normalizarFilasComercios(
    filas,
    localidadPorDefecto,
    (indice) => numerosDeFila[indice] ?? indice + 1
  );
}
