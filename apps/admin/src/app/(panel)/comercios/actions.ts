"use server";

import { normalizarCodigoComercio, validarCodigoComercio } from "@lbm/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirAdmin } from "@/lib/auth";
import { exito, fallo, mensajeDeError, type EstadoFormulario } from "@/lib/formularios";

const CODIGO_DUPLICADO = "Ya existe un comercio con ese código.";

interface CamposComercio {
  codigo: string;
  nombre: string;
  localidad: string;
  direccion: string | null;
  zona: string | null;
}

// telefono queda afuera a propósito, y no se toca en el update: la columna
// sigue en la base con los pocos que estaban cargados, pero salió de las
// pantallas porque no servía para repartir. Lo que hace falta es saber llegar.
function leerCampos(formData: FormData): CamposComercio {
  // Vacío es null y no "": la base las trata distinto y conviene que haya una
  // sola forma de decir "no está cargado".
  const opcional = (nombre: string) => String(formData.get(nombre) ?? "").trim() || null;

  return {
    codigo: normalizarCodigoComercio(String(formData.get("codigo") ?? "")),
    nombre: String(formData.get("nombre") ?? "").trim(),
    localidad: String(formData.get("localidad") ?? "").trim(),
    direccion: opcional("direccion"),
    zona: opcional("zona"),
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

// Elimina el comercio de verdad (no la baja lógica de cambiarEstadoComercio).
// Solo funciona si nunca tuvo visitas ni pedidos — si los tiene, se rechaza
// para no perder ese histórico, y hay que darlo de baja en su lugar.
export async function eliminarComercio(
  _estadoPrevio: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const { supabase } = await requerirAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return fallo("Falta el comercio a eliminar.");

  const [{ count: visitas }, { count: pedidos }] = await Promise.all([
    supabase.from("visitas").select("id", { count: "exact", head: true }).eq("comercio_id", id),
    supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("comercio_id", id),
  ]);

  if ((visitas ?? 0) > 0 || (pedidos ?? 0) > 0) {
    return fallo("No se puede eliminar: ya tiene visitas o pedidos cargados. Dalo de baja en su lugar.");
  }

  const { error: errorDb } = await supabase.from("comercios").delete().eq("id", id);
  if (errorDb) return fallo(mensajeDeError(errorDb, CODIGO_DUPLICADO));

  revalidatePath("/comercios");
  redirect("/comercios");
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

/**
 * Pone (o corrige) el punto del comercio en el mapa, desde el panel.
 *
 * El camino bueno sigue siendo que el repartidor lo tome con el GPS parado en
 * la puerta: es exacto y no hay nada que escribir. Pero el dueño necesita
 * poder arreglar uno mal puesto sin esperar a que alguien vuelva a pasar, y
 * cargar los que ya sabe de memoria sin salir del local.
 *
 * Va por las RLS normales del admin y no por guardar_ubicacion_comercio: esa
 * función existe para darle al repartidor un permiso que no tiene, y el admin
 * ya puede escribir comercios. Meterlo ahí sería ampliarla sin necesidad.
 *
 * A diferencia de la del repartidor, esta sí acepta comercios dados de baja:
 * el mapa los muestra cuando vendieron en el período, así que un punto mal
 * puesto se sigue viendo y tiene que poder corregirse.
 */
export async function guardarUbicacionComercio(
  _estadoPrevio: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const { supabase } = await requerirAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return fallo("Falta el comercio.");

  // Quitar el punto es parte del trabajo: uno mal puesto engaña más que uno
  // que falta, porque el que arma el recorrido lo da por bueno.
  if (formData.get("quitar") === "1") {
    const { error } = await supabase
      .from("comercios")
      .update({ lat: null, lng: null, ubicacion_tomada_en: null })
      .eq("id", id);
    if (error) return fallo(mensajeDeError(error, CODIGO_DUPLICADO));

    revalidatePath("/comercios");
    revalidatePath(`/comercios/${id}`);
    revalidatePath("/mapa");
    return exito("Se quitó del mapa.");
  }

  // Coma o punto decimal: se copian de Google Maps y de la configuración del
  // teclado, y rechazar "−40,80" por la coma sería pelearse con quien lo usa.
  const numero = (nombre: string) => {
    const crudo = String(formData.get(nombre) ?? "").trim().replace(",", ".");
    if (!crudo) return null;
    const valor = Number(crudo);
    return Number.isFinite(valor) ? valor : null;
  };

  const lat = numero("lat");
  const lng = numero("lng");

  if (lat === null || lng === null) {
    return fallo("Marcá el punto en el mapa o escribí las dos coordenadas.");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return fallo("Esas coordenadas no existen: la latitud va de -90 a 90 y la longitud de -180 a 180.");
  }

  const { error } = await supabase
    .from("comercios")
    .update({
      // Seis decimales son ~10 cm, que es de sobra para una puerta, y es la
      // precisión que aguanta la columna: mandar más la redondearía igual.
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      ubicacion_tomada_en: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return fallo(mensajeDeError(error, CODIGO_DUPLICADO));

  revalidatePath("/comercios");
  revalidatePath(`/comercios/${id}`);
  revalidatePath("/mapa");
  return exito("Ubicación guardada. Ya se ve en el mapa.");
}
