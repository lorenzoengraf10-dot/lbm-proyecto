"use server";

import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { emailInterno, normalizarUsername, validarUsername } from "@lbm/shared";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import {
  exito as formularioExito,
  fallo as formularioFallo,
  mensajeDeError,
  type EstadoFormulario,
} from "@/lib/formularios";
import { crearClienteServiceRole } from "@/lib/supabase-admin";
import type { EstadoVendedor } from "./tipos";

// Sin l/1/I ni 0/O: la credencial se dicta o se manda por WhatsApp y esos
// caracteres se confunden al leerlos.
const ALFABETO = "abcdefghijkmnpqrstuvwxyz23456789";
const LARGO_CREDENCIAL = 10;

function generarCredencial(): string {
  // randomInt del módulo crypto: aleatoriedad criptográfica y sin sesgo.
  return Array.from({ length: LARGO_CREDENCIAL }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
}

function fallo(error: string): EstadoVendedor {
  return { error, ok: null, credencial: null };
}

export async function crearUsuario(
  _estadoPrevio: EstadoVendedor,
  formData: FormData
): Promise<EstadoVendedor> {
  // Sin esto, cualquiera podría llamar a esta action: son endpoints HTTP.
  await requerirAdmin();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const username = normalizarUsername(String(formData.get("username") ?? ""));
  const rol = String(formData.get("rol") ?? "");

  if (!nombre) return fallo("El nombre no puede estar vacío.");

  const errorUsuario = validarUsername(username);
  if (errorUsuario) return fallo(errorUsuario);

  // Nunca confiar en el valor que llega del formulario: sin este chequeo se
  // podría pedir cualquier rol editando el HTML.
  if (rol !== "admin" && rol !== "vendedor") {
    return fallo("Elegí si la cuenta es de administrador o de vendedor.");
  }

  const admin = crearClienteServiceRole();

  const { data: existente } = await admin
    .from("usuarios")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existente) return fallo(`Ya hay un usuario "${username}".`);

  const clave = generarCredencial();
  const { data, error } = await admin.auth.admin.createUser({
    email: emailInterno(username),
    password: clave,
    email_confirm: true,
  });

  if (error || !data.user) {
    return fallo(`No se pudo crear la cuenta: ${error?.message ?? "error desconocido"}`);
  }

  const { error: errorPerfil } = await admin.from("usuarios").insert({
    id: data.user.id,
    nombre,
    username,
    rol,
  });

  if (errorPerfil) {
    // Una cuenta de auth sin perfil no sirve para nada y además bloquearía el
    // usuario para un reintento: se revierte.
    await admin.auth.admin.deleteUser(data.user.id);
    return fallo(mensajeDeError(errorPerfil, `Ya hay un usuario "${username}".`));
  }

  revalidatePath("/usuarios");
  return {
    error: null,
    ok: `Vendedor ${nombre} creado.`,
    credencial: { usuario: username, clave },
  };
}

export async function resetearCredencial(
  _estadoPrevio: EstadoVendedor,
  formData: FormData
): Promise<EstadoVendedor> {
  await requerirAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return fallo("Falta el usuario a resetear.");

  const admin = crearClienteServiceRole();

  const { data: usuario } = await admin
    .from("usuarios")
    .select("username")
    .eq("id", id)
    .maybeSingle();

  if (!usuario) return fallo("No se encontró ese usuario.");

  const clave = generarCredencial();
  const { error } = await admin.auth.admin.updateUserById(id, { password: clave });

  if (error) return fallo(`No se pudo resetear la credencial: ${error.message}`);

  return {
    error: null,
    ok: "Credencial nueva generada.",
    credencial: { usuario: usuario.username, clave },
  };
}

// Para la propia cuenta, a diferencia de resetearCredencial: cada uno elige
// su contraseña en vez de recibir una generada al azar. Usa el cliente atado
// a la sesión (no el de service role) porque auth.updateUser() ya sin eso
// solo puede tocar la cuenta de quien está logueado, nunca la de otro.
export async function cambiarMiPassword(
  _estadoPrevio: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const { supabase } = await requerirAdmin();

  const nueva = String(formData.get("nueva") ?? "");
  const confirmar = String(formData.get("confirmar") ?? "");

  if (nueva.length < 6) {
    return formularioFallo("La contraseña tiene que tener al menos 6 caracteres.");
  }
  if (nueva !== confirmar) {
    return formularioFallo("Las dos contraseñas no coinciden.");
  }

  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) {
    return formularioFallo(`No se pudo cambiar la contraseña: ${error.message}`);
  }

  return formularioExito("Contraseña actualizada.");
}

// Elimina la cuenta de verdad (no la baja lógica de cambiarEstadoUsuario):
// borra el usuario de Supabase Auth, que en cascada se lleva el perfil de
// public.usuarios. Solo funciona si el vendedor nunca cargó visitas ni
// pedidos — si los tiene, se rechaza para no perder el histórico de
// comisiones, y hay que darlo de baja en su lugar.
export async function eliminarUsuario(
  _estadoPrevio: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const { userId } = await requerirAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return formularioFallo("Falta el usuario a eliminar.");
  if (id === userId) return formularioFallo("No podés eliminar tu propia cuenta.");

  const admin = crearClienteServiceRole();

  const [{ count: visitas }, { count: pedidos }] = await Promise.all([
    admin.from("visitas").select("id", { count: "exact", head: true }).eq("vendedor_id", id),
    admin.from("pedidos").select("id", { count: "exact", head: true }).eq("vendedor_id", id),
  ]);

  if ((visitas ?? 0) > 0 || (pedidos ?? 0) > 0) {
    return formularioFallo(
      "No se puede eliminar: ya tiene visitas o pedidos cargados. Dalo de baja en su lugar."
    );
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return formularioFallo(`No se pudo eliminar: ${error.message}`);

  revalidatePath("/usuarios");
  redirect("/usuarios");
}

export async function cambiarEstadoUsuario(formData: FormData): Promise<void> {
  const { supabase, userId } = await requerirAdmin();

  const id = String(formData.get("id") ?? "");
  const activo = formData.get("activo") === "true";

  // Que un admin no se pueda dejar afuera del panel a sí mismo.
  if (!id || (id === userId && !activo)) return;

  await supabase.from("usuarios").update({ activo }).eq("id", id);

  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${id}`);
}
