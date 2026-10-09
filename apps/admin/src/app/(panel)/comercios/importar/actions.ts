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

  // Lo que el archivo no trae no tiene que borrar lo que ya estaba. El lector
  // pone null en dirección y zona cuando la columna falta o la celda está en
  // blanco, y un upsert con ese null pisaba lo cargado a mano: volver a subir
  // la lista original para sumar comercios nuevos borraba todas las
  // direcciones y zonas. Se manda cada campo opcional solo si viene con algo.
  //
  // Las filas se agrupan por qué campos traen, porque el upsert actualiza
  // exactamente las columnas que recibe: todas las filas de un mismo envío
  // tienen que traer las mismas.
  type Registro = {
    codigo: string;
    nombre: string;
    localidad: string;
    direccion?: string;
    zona?: string;
  };
  const grupos = new Map<string, Registro[]>();
  for (const fila of validas) {
    const registro: Registro = {
      codigo: fila.codigo,
      nombre: fila.nombre,
      localidad: fila.localidad,
    };
    if (fila.direccion) registro.direccion = fila.direccion;
    if (fila.zona) registro.zona = fila.zona;
    const firma = Object.keys(registro).join(",");
    grupos.set(firma, [...(grupos.get(firma) ?? []), registro]);
  }

  for (const filas of grupos.values()) {
    const { error } = await supabase.from("comercios").upsert(filas, { onConflict: "codigo" });
    if (error) {
      return { error: mensajeDeError(error, "Hay códigos repetidos en el archivo."), importados: 0 };
    }
  }

  revalidatePath("/comercios");
  return { error: null, importados: validas.length };
}
