"use server";

import { parsearCsvComercios, type ResultadoImportacion } from "@lbm/shared";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import { parsearExcelComercios } from "@/lib/excel-comercios";
import { mensajeDeError } from "@/lib/formularios";

const LIMITE_CARACTERES = 500_000;
const DEMASIADO_GRANDE = "El archivo es demasiado grande. Partilo en tandas más chicas.";

/**
 * El archivo llega como texto (CSV) o en base64 (Excel, que es binario). En
 * los dos casos se parsea acá, en el servidor: la previsualización es solo lo
 * que se muestra, no lo que se guarda.
 */
export interface ArchivoImportado {
  tipo: "csv" | "excel";
  contenido: string;
  localidadPorDefecto: string;
}

async function parsear(archivo: ArchivoImportado): Promise<ResultadoImportacion> {
  if (archivo.tipo === "excel") {
    const binario = Buffer.from(archivo.contenido, "base64");
    // Buffer.buffer puede ser un pedazo de uno más grande y compartido: hay que
    // recortarlo, si no ExcelJS lee basura de al lado.
    const datos = binario.buffer.slice(
      binario.byteOffset,
      binario.byteOffset + binario.byteLength
    ) as ArrayBuffer;
    return parsearExcelComercios(datos, archivo.localidadPorDefecto);
  }
  return parsearCsvComercios(archivo.contenido, archivo.localidadPorDefecto);
}

export async function previsualizarArchivo(
  archivo: ArchivoImportado
): Promise<ResultadoImportacion> {
  await requerirAdmin();

  if (archivo.contenido.length > LIMITE_CARACTERES) {
    return { validas: [], errores: [DEMASIADO_GRANDE] };
  }
  return parsear(archivo);
}

export interface ResultadoImport {
  error: string | null;
  importados: number;
}

export async function confirmarImportacion(
  archivo: ArchivoImportado
): Promise<ResultadoImport> {
  const { supabase } = await requerirAdmin();

  if (archivo.contenido.length > LIMITE_CARACTERES) {
    return { error: DEMASIADO_GRANDE, importados: 0 };
  }

  // Se vuelve a parsear en el servidor en vez de confiar en lo que muestra la
  // previsualización: el cliente podría mandar cualquier cosa.
  const { validas } = await parsear(archivo);

  if (validas.length === 0) {
    return { error: "No hay filas válidas para importar.", importados: 0 };
  }

  const { error } = await supabase.from("comercios").upsert(validas, { onConflict: "codigo" });
  if (error) {
    return { error: mensajeDeError(error, "Hay códigos repetidos en el archivo."), importados: 0 };
  }

  revalidatePath("/comercios");
  return { error: null, importados: validas.length };
}
