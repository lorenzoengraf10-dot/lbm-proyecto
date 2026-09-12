import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@lbm/shared";
import { claveServiceRole, urlSupabase } from "./env";

/**
 * Cliente con service role: BYPASEA RLS. Acá se usa solo para el login por
 * PIN, que necesita hacer dos cosas que el vendedor todavía no puede hacer
 * porque justamente no inició sesión: leer la lista de repartidores para
 * mostrarla, y llevar la cuenta de intentos fallidos en intentos_pin.
 *
 * Nunca se expone al navegador: vive detrás de server actions.
 */
export function crearClienteServiceRole() {
  return createClient<Database>(urlSupabase(), claveServiceRole(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
