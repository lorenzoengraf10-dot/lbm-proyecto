import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@lbm/shared";
import { claveServiceRole, urlSupabase } from "./env";

/**
 * Cliente con service role: BYPASEA RLS por completo. Se usa solo para crear
 * y resetear cuentas de vendedores, que requiere permisos de administrador
 * sobre Auth. Quien lo llame tiene que haber verificado antes que el usuario
 * de la sesión es admin (ver requerirAdmin en auth.ts).
 */
export function crearClienteServiceRole() {
  return createClient<Database>(urlSupabase(), claveServiceRole(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
