"use server";

import { parsearCsvComercios, type ResultadoImportacion } from "@lbm/shared";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import { mensajeDeError } from "@/lib/formularios";

const LIMITE_CARACTERES = 500_000;
const DEMASIADO_GRANDE = "El archivo es demasiado grande. Partilo en tandas más chicas.";

export async function previsualizarCsv(contenido: string): Promise<ResultadoImportacion> {
  await requerirAdmin();

  if (contenido.length > LIMITE_CARACTERES) {
    return { validas: [], errores: [DEMASIADO_GRANDE] };
  }
  return parsearCsvComercios(contenido);
}

export interface ResultadoImport {
  error: string | null;
  importados: number;
}

export async function confirmarImportacion(contenido: string): Promise<ResultadoImport> {
  const { supabase } = await requerirAdmin();

  if (contenido.length > LIMITE_CARACTERES) {
    return { error: DEMASIADO_GRANDE, importados: 0 };
  }

  // Se vuelve a parsear en el servidor en vez de confiar en lo que muestra la
  // previsualización: el cliente podría mandar cualquier cosa.
  const { validas } = parsearCsvComercios(contenido);

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
