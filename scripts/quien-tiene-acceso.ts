// Audita quiénes pueden entrar al sistema.
//
// Cruza las cuentas de Supabase Auth contra los perfiles de public.usuarios y
// marca cualquier cuenta que no debería existir. Una cuenta sin perfil no ve
// nada (las policies lo impiden), pero si aparece alguna es señal de que el
// registro público quedó abierto en algún momento.
//
// Uso: pnpm --filter @lbm/scripts run acceso

import { crearClienteAdmin } from "./supabaseAdmin";

async function main() {
  const supabase = crearClienteAdmin();

  const { data: cuentas, error: errorCuentas } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (errorCuentas) throw new Error(`No se pudieron listar las cuentas: ${errorCuentas.message}`);

  const { data: perfiles, error: errorPerfiles } = await supabase
    .from("usuarios")
    .select("id, nombre, username, rol, activo");
  if (errorPerfiles) throw new Error(`No se pudieron leer los perfiles: ${errorPerfiles.message}`);

  const porId = new Map((perfiles ?? []).map((perfil) => [perfil.id, perfil]));

  const conAcceso = (perfiles ?? []).filter((perfil) => perfil.activo);
  const dadosDeBaja = (perfiles ?? []).filter((perfil) => !perfil.activo);
  const sinPerfil = cuentas.users.filter((cuenta) => !porId.has(cuenta.id));

  console.log(`\nCuentas que HOY pueden entrar (${conAcceso.length}):`);
  for (const perfil of conAcceso) {
    console.log(`  ${perfil.rol.padEnd(8)} ${perfil.username.padEnd(16)} ${perfil.nombre}`);
  }

  if (dadosDeBaja.length > 0) {
    console.log(`\nDados de baja, sin acceso (${dadosDeBaja.length}):`);
    for (const perfil of dadosDeBaja) {
      console.log(`  ${perfil.rol.padEnd(8)} ${perfil.username.padEnd(16)} ${perfil.nombre}`);
    }
  }

  if (sinPerfil.length > 0) {
    console.log(`\n⚠  ${sinPerfil.length} cuenta(s) de Auth SIN perfil en el sistema:`);
    for (const cuenta of sinPerfil) {
      console.log(`  ${cuenta.email ?? cuenta.id} (creada ${cuenta.created_at})`);
    }
    console.log(
      "\n  No ven ningún dato (las policies exigen un perfil activo), pero no deberían\n" +
        "  existir. Revisá que el registro público esté apagado:\n" +
        "    pnpm dlx supabase config diff\n"
    );
    process.exitCode = 1;
    return;
  }

  console.log("\nSin cuentas de más. El sistema está cerrado.\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
