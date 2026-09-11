"use server";

import { emailInterno } from "@lbm/shared";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase-server";

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

  if (!perfil || perfil.rol !== "vendedor" || !perfil.activo) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta no tiene acceso a la app del vendedor." };
  }

  redirect("/comercios");
}
