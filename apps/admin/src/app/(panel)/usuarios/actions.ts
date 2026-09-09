"use server";

import { randomInt } from "node:crypto";
import { emailInterno, normalizarUsername, validarUsername } from "@lbm/shared";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import { mensajeDeError } from "@/lib/formularios";
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
