// Las NEXT_PUBLIC_* se leen literalmente (no por índice) porque Next las
// reemplaza en tiempo de compilación y un acceso dinámico rompería eso.
function requerida(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copiá apps/vendedor/.env.example a apps/vendedor/.env.local y completala.`
    );
  }
  return valor;
}

export function urlSupabase(): string {
  return requerida("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function clavePublica(): string {
  return requerida("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
