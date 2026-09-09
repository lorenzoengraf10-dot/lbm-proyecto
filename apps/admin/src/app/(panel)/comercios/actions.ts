"use server";

import { normalizarCodigoComercio, validarCodigoComercio } from "@lbm/shared";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import { exito, fallo, mensajeDeError, type EstadoFormulario } from "@/lib/formularios";

const CODIGO_DUPLICADO = "Ya existe un comercio con ese código.";

interface CamposComercio {
  codigo: string;
  nombre: string;
  localidad: string;
  telefono: string | null;
}

function leerCampos(formData: FormData): CamposComercio {
  const telefono = String(formData.get("telefono") ?? "").trim();

  return {
    codigo: normalizarCodigoComercio(String(formData.get("codigo") ?? "")),
    nombre: String(formData.get("nombre") ?? "").trim(),
    localidad: String(formData.get("localidad") ?? "").trim(),
    telefono: telefono || null,
  };
}

function validar(campos: CamposComercio): string | null {
  const errorCodigo = validarCodigoComercio(campos.codigo);
  if (errorCodigo) return errorCodigo;
  if (!campos.nombre) return "El nombre del comercio no puede estar vacío.";
  if (!campos.localidad) return "La localidad no puede estar vacía.";
  return null;
}

export async function crearComercio(
  _estadoPrevio: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const { supabase } = await requerirAdmin();

  const campos = leerCampos(formData);
  const error = validar(campos);
  if (error) return fallo(error);

  const { error: errorDb } = await supabase.from("comercios").insert(campos);
  if (errorDb) return fallo(mensajeDeError(errorDb, CODIGO_DUPLICADO));

  revalidatePath("/comercios");
  return exito(`Comercio ${campos.codigo} creado.`);
}

export async function actualizarComercio(
  _estadoPrevio: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const { supabase } = await requerirAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return fallo("Falta el comercio a editar.");

  const campos = leerCampos(formData);
  const error = validar(campos);
  if (error) return fallo(error);

  const { error: errorDb } = await supabase.from("comercios").update(campos).eq("id", id);
  if (errorDb) return fallo(mensajeDeError(errorDb, CODIGO_DUPLICADO));

  revalidatePath("/comercios");
  revalidatePath(`/comercios/${id}`);
  return exito("Cambios guardados.");
}

export async function cambiarEstadoComercio(formData: FormData): Promise<void> {
  const { supabase } = await requerirAdmin();

  const id = String(formData.get("id") ?? "");
  const activo = formData.get("activo") === "true";
  if (!id) return;

  // Baja lógica: nunca se borra, para no perder el histórico de visitas y pedidos.
  await supabase.from("comercios").update({ activo }).eq("id", id);

  revalidatePath("/comercios");
  revalidatePath(`/comercios/${id}`);
}
