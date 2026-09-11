import { createServerClient } from "@supabase/ssr";
import type { Database } from "@lbm/shared";
import { cookies } from "next/headers";
import { clavePublica, urlSupabase } from "./env";

/**
 * Cliente atado a la sesión del usuario: todas las consultas pasan por las
 * policies de RLS, así que la app nunca ve más de lo que el rol permite.
 */
export async function crearClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient<Database>(urlSupabase(), clavePublica(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesAEscribir) {
        try {
          cookiesAEscribir.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Los Server Components no pueden escribir cookies. El refresh de
          // sesión lo resuelve proxy.ts, así que acá se puede ignorar.
        }
      },
    },
  });
}
