"use server";

import { redirect } from "next/navigation";
import {
  MAX_INTENTOS_PIN,
  MINUTOS_BLOQUEO,
  derivarPassword,
  emailInterno,
  validarPin,
} from "@lbm/shared";
import { claveServiceRole } from "@/lib/env";
import { crearClienteServidor } from "@/lib/supabase-server";
import { crearClienteServiceRole } from "@/lib/supabase-admin";

export interface EstadoLogin {
  error: string | null;
}

export interface Repartidor {
  id: string;
  nombre: string;
}

/**
 * Los repartidores activos, para que cada uno toque su nombre en vez de
 * escribir un usuario. Se muestra sin haber iniciado sesión, así que es la
 * única cosa que esta app cuenta antes de autenticar: los nombres de pila del
 * personal. Es una app interna de un negocio donde esos nombres no son
 * secreto, y a cambio se gana que entrar sea un toque y seis números.
 */
export async function listarRepartidores(): Promise<Repartidor[]> {
  const admin = crearClienteServiceRole();
  const { data } = await admin
    .from("usuarios")
    .select("id, nombre")
    .eq("rol", "vendedor")
    .eq("activo", true)
    .order("nombre");
  return data ?? [];
}

/**
 * Entrar con el PIN. Acá está el control que hace que un secreto de seis
 * números alcance: cada intento pasa por este servidor, que los cuenta y
 * bloquea la cuenta un rato cuando se pasa. Contra el endpoint de Supabase
 * Auth no se puede probar nada, porque la contraseña que guarda no es el PIN
 * sino un HMAC que necesita el secreto del servidor (ver derivarPassword).
 */
export async function entrarConPin(id: string, pin: string): Promise<EstadoLogin> {
  if (!id) return { error: "Elegí quién sos." };
  if (validarPin(pin)) return { error: "PIN incorrecto." };

  const admin = crearClienteServiceRole();

  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, username, rol, activo")
    .eq("id", id)
    .maybeSingle();

  // Mismo mensaje que un PIN equivocado: si dijera "esa cuenta no existe" se
  // podría averiguar qué ids son válidos probando.
  if (!usuario || usuario.rol !== "vendedor" || !usuario.activo) {
    return { error: "PIN incorrecto." };
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
      error: `Demasiados intentos. Probá de nuevo en ${minutos} ${minutos === 1 ? "minuto" : "minutos"}, o pedile al dueño un PIN nuevo.`,
    };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({
    // El email interno de siempre: fijar el PIN solo cambia la contraseña,
    // no la cuenta.
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
          ? new Date(Date.now() + MINUTOS_BLOQUEO * 60000).toISOString()
          : null,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "usuario_id" }
    );

    if (sePaso) {
      return {
        error: `Demasiados intentos. Probá de nuevo en ${MINUTOS_BLOQUEO} minutos, o pedile al dueño un PIN nuevo.`,
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

  redirect("/comercios");
}
