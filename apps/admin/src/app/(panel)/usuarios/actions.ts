"use server";

import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import {
  derivarPassword,
  emailInterno,
  normalizarUsername,
  validarPin,
  validarUsername,
} from "@lbm/shared";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import {
  exito as formularioExito,
  fallo as formularioFallo,
  mensajeDeError,
  type EstadoFormulario,
} from "@/lib/formularios";
import { claveServiceRole } from "@/lib/env";
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

  // La contraseña nueva reemplaza al PIN: es la misma credencial. Se borra la
  // marca para que la pantalla lo diga en vez de repetir "PIN incorrecto".
  await admin.from("usuarios").update({ pin_fijado_en: null }).eq("id", id);
  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${id}`);

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

/**
 * Cambia el porcentaje de comisión de un vendedor. El cambio vale para los
 * pedidos que vengan de ahora en más: los ya cargados tienen su propio
 * comision_pct congelado desde que se crearon (migración 20260912000001), así
 * que ni las comisiones ya pagadas ni los reportes viejos se mueven.
 */
export async function cambiarComision(
  _estadoPrevio: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const { supabase } = await requerirAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return formularioFallo("Falta el vendedor.");

  // Se acepta tanto "3.5" como "3,5": el teclado del panel es el de siempre y
  // en Argentina la coma es lo natural.
  const crudo = String(formData.get("comision_pct") ?? "").trim().replace(",", ".");
  const pct = Number(crudo);

  if (crudo === "" || !Number.isFinite(pct)) {
    return formularioFallo("Poné un porcentaje, por ejemplo 3 o 3,5.");
  }
  if (pct < 0 || pct > 100) {
    return formularioFallo("El porcentaje tiene que estar entre 0 y 100.");
  }
  // numeric(5,2) en la base: más de dos decimales se redondearían en silencio.
  const redondeado = Math.round(pct * 100) / 100;

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", id)
    .maybeSingle();

  if (!usuario) return formularioFallo("No se encontró el vendedor.");
  if (usuario.rol !== "vendedor") {
    return formularioFallo("Solo los vendedores cobran comisión.");
  }

  const { error } = await supabase
    .from("usuarios")
    .update({ comision_pct: redondeado })
    .eq("id", id);

  if (error) {
    return formularioFallo(mensajeDeError(error, "Ya existe ese valor."));
  }

  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${id}`);
  revalidatePath("/comisiones");

  return formularioExito(
    `Comisión actualizada a ${redondeado}%. Vale para los pedidos nuevos; los anteriores quedan como estaban.`
  );
}

/**
 * Le pone a alguien el PIN con el que entra: al repartidor a su app, al
 * administrador al panel.
 *
 * Lo que se guarda en Supabase Auth no es el PIN sino una contraseña derivada
 * con HMAC del PIN + el secreto del servidor (ver derivarPassword). Así, aunque
 * alguien conozca el endpoint de Auth, no puede probar PIN ahí: sin el secreto
 * no sabe qué contraseña mandar. El PIN en sí no se guarda en ningún lado, ni
 * acá ni en la base — si el repartidor se lo olvida, se le pone uno nuevo.
 */
export async function fijarPin(
  _estadoPrevio: EstadoVendedor,
  formData: FormData
): Promise<EstadoVendedor> {
  await requerirAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return fallo("Falta el repartidor.");

  const pin = String(formData.get("pin") ?? "").trim();
  const problema = validarPin(pin);
  if (problema) return fallo(problema);

  const admin = crearClienteServiceRole();

  const { data: usuario } = await admin
    .from("usuarios")
    .select("username, nombre, rol")
    .eq("id", id)
    .maybeSingle();

  if (!usuario) return fallo("No se encontró ese usuario.");

  const password = await derivarPassword(pin, id, claveServiceRole());
  const { error } = await admin.auth.admin.updateUserById(id, { password });

  if (error) return fallo(`No se pudo guardar el PIN: ${error.message}`);

  // Un PIN nuevo borra el bloqueo por intentos fallidos: si se lo cambiaste es
  // justamente porque no podía entrar. Y queda anotado que ya tiene uno, para
  // poder avisarle si intenta entrar sin haberlo recibido.
  await Promise.all([
    admin.from("intentos_pin").delete().eq("usuario_id", id),
    admin.from("usuarios").update({ pin_fijado_en: new Date().toISOString() }).eq("id", id),
  ]);

  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${id}`);

  return {
    error: null,
    ok: "PIN guardado.",
    credencial: { usuario: usuario.nombre, clave: pin },
  };
}
