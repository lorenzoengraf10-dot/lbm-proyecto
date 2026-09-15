import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@lbm/shared";
import { claveServiceRole, urlSupabase } from "./env";

/**
 * Cliente con service role: BYPASEA RLS. Nunca se expone al navegador: vive
 * detrás de server actions y de rutas del servidor.
 *
 * Se usa en exactamente dos lugares, y en los dos porque hace falta leer algo
 * que las RLS del repartidor no alcanzan:
 *
 *  1. El login por PIN, que todavía no tiene sesión con la cual leer la lista
 *     de repartidores ni llevar la cuenta de intentos fallidos.
 *  2. La planilla para armar (planilla-repartidor.ts), que muestra los pedidos
 *     de todos los comercios y no solo los que tomó él. Ahí se verifica
 *     primero quién llama y recién después se usa este cliente.
 *
 * Si aparece un tercer uso, conviene preguntarse antes si de verdad hace
 * falta: cada uno es un lugar donde las RLS dejan de protegernos.
 */
export function crearClienteServiceRole() {
  return createClient<Database>(urlSupabase(), claveServiceRole(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
