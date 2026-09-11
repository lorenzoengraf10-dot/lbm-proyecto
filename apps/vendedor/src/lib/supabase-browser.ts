"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@lbm/shared";
import { clavePublica, urlSupabase } from "./env";

// Mismas cookies que el cliente de servidor (@supabase/ssr las comparte),
// así que la sesión iniciada acá también la ve requerirVendedor() en el
// servidor. Se usa solo donde hace falta algo inherentemente del navegador
// (la cámara del escáner); todo lo que escribe en la base pasa por server
// actions, no por este cliente.
export function crearClienteNavegador() {
  return createBrowserClient<Database>(urlSupabase(), clavePublica());
}
