"use server";

import {
  MAX_INTENTOS_PIN,
  derivarPassword,
  emailInterno,
  validarPin,
} from "@lbm/shared";
import { redirect } from "next/navigation";
import { claveServiceRole } from "@/lib/env";
import { crearClienteServidor } from "@/lib/supabase-server";
import { crearClienteServiceRole } from "@/lib/supabase-admin";

// La cuenta del dueño puede todo: si alguien se pone a probar PIN, que espere
// más que en la app del repartidor.
const MINUTOS_BLOQUEO_ADMIN = 60;

export interface EstadoLogin {
  error: string | null;
}

export async function iniciarSesion(
  _estadoPrevio: EstadoLogin,
  formData: FormData
): Promise<EstadoLogin> {
  const usuario = String(formData.get("usuario") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!usuario || !password) {
    return { error: "Completá usuario y contraseña." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailInterno(usuario),
    password,
  });

  if (error || !data.user) {
    // Mismo mensaje para usuario inexistente y contraseña incorrecta: si se
    // distinguieran, se podría averiguar qué usuarios existen.
    return { error: "Usuario o contraseña incorrectos." };
  }

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol, activo")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!perfil || perfil.rol !== "admin" || !perfil.activo) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta no tiene acceso al panel de administración." };
  }

  redirect("/");
}

/**
 * Los administradores activos, para tocar el nombre en vez de escribirlo.
 * Igual que en la app del repartidor, es lo único que el panel cuenta antes
 * de autenticar.
 */
export async function listarAdmins(): Promise<
  { id: string; nombre: string; tienePin: boolean }[]
> {
  const admin = crearClienteServiceRole();
  const { data } = await admin
    .from("usuarios")
    .select("id, nombre, pin_fijado_en")
    .eq("rol", "admin")
    .eq("activo", true)
    .order("nombre");
  return (data ?? []).map(({ id, nombre, pin_fijado_en }) => ({
    id,
    nombre,
    tienePin: pin_fijado_en !== null,
  }));
}

/**
 * Entrar al panel con el PIN, igual que el repartidor en su app: la
 * contraseña que se manda a Auth es un HMAC del PIN con el secreto del
 * servidor, y los intentos se cuentan acá para poder frenarlos.
 *
 * La cuenta de administrador puede todo, así que el bloqueo es más largo que
 * el del repartidor.
 */
export async function entrarConPin(id: string, pin: string): Promise<EstadoLogin> {
  if (!id) return { error: "Elegí quién sos." };
  if (validarPin(pin)) return { error: "PIN incorrecto." };

  const admin = crearClienteServiceRole();

  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, username, rol, activo, pin_fijado_en")
    .eq("id", id)
    .maybeSingle();

  // Mismo mensaje que un PIN equivocado, para no revelar qué ids existen.
  if (!usuario || usuario.rol !== "admin" || !usuario.activo) {
    return { error: "PIN incorrecto." };
  }

  if (!usuario.pin_fijado_en) {
    return { error: "Todavía no tenés un PIN. Entrá con tu contraseña y cargate uno." };
  }

  const { data: intentos } = await admin
    .from("intentos_pin")
    .select("fallidos, bloqueado_hasta")
    .eq("usuario_id", id)
    .maybeSingle();

  if (intentos?.bloqueado_hasta && new Date(intentos.bloqueado_hasta) > new Date()) {
    const minutos = Math.max(
      1,
      Math.ceil((new Date(intentos.bloqueado_hasta).getTime() - Date.now()) / 60000)
    );
    return {
      error: `Demasiados intentos. Probá de nuevo en ${minutos} ${minutos === 1 ? "minuto" : "minutos"}, o entrá con tu contraseña.`,
    };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailInterno(usuario.username),
    password: await derivarPassword(pin, id, claveServiceRole()),
  });

  if (error || !data.user) {
    const fallidos = (intentos?.fallidos ?? 0) + 1;
    const sePaso = fallidos >= MAX_INTENTOS_PIN;

    await admin.from("intentos_pin").upsert(
      {
        usuario_id: id,
        fallidos: sePaso ? 0 : fallidos,
        bloqueado_hasta: sePaso
          ? new Date(Date.now() + MINUTOS_BLOQUEO_ADMIN * 60000).toISOString()
          : null,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "usuario_id" }
    );

    if (sePaso) {
      return {
        error: `Demasiados intentos. Probá de nuevo en ${MINUTOS_BLOQUEO_ADMIN} minutos, o entrá con tu contraseña.`,
      };
    }

    const quedan = MAX_INTENTOS_PIN - fallidos;
    return {
      error: `PIN incorrecto. Te ${quedan === 1 ? "queda 1 intento" : `quedan ${quedan} intentos`}.`,
    };
  }

  if (intentos) {
    await admin.from("intentos_pin").delete().eq("usuario_id", id);
  }

  redirect("/");
}
