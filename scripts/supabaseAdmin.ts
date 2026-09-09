import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

export function crearClienteAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno. " +
        "Copiá .env.example a .env y completá los datos del proyecto Supabase."
    );
  }

  // Service role: bypasea RLS a propósito, solo para scripts de administración
  // corridos desde una máquina de confianza. Nunca usar esta key en la app.
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
