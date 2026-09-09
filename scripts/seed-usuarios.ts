// Da de alta el admin y los vendedores de prueba de la etapa 1.
//
// El PIN de 4 dígitos que va a usar el vendedor a diario NO se crea acá:
// es un mecanismo local al celular (etapa 4/5, ver docs/PLAN.md sección 2.1).
// Acá se crea la credencial REAL de Supabase Auth (>= 6 caracteres, como
// exige la plataforma), que el vendedor solo usa una vez para configurar
// su dispositivo.
//
// Uso: pnpm --filter @lbm/scripts run seed:usuarios

import { emailInterno, type Rol } from "@lbm/shared";
import { crearClienteAdmin } from "./supabaseAdmin";

interface UsuarioSemilla {
  username: string;
  nombre: string;
  rol: Rol;
  passwordDev: string;
}

// Credenciales de desarrollo/prueba únicamente. Para cualquier ambiente que
// no sea local, dar de alta las cuentas reales desde el panel admin, que
// genera credenciales al azar.
const USUARIOS_SEED: UsuarioSemilla[] = [
  { username: "admin", nombre: "Administrador", rol: "admin", passwordDev: "admin-dev-0001" },
  { username: "vendedor1", nombre: "Vendedor de Prueba 1", rol: "vendedor", passwordDev: "vendedor1-dev" },
  { username: "vendedor2", nombre: "Vendedor de Prueba 2", rol: "vendedor", passwordDev: "vendedor2-dev" },
];

async function main() {
  const supabase = crearClienteAdmin();
  let huboErrores = false;

  for (const usuario of USUARIOS_SEED) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: emailInterno(usuario.username),
      password: usuario.passwordDev,
      email_confirm: true,
    });

    if (error || !data.user) {
      console.error(`✗ ${usuario.username}: no se pudo crear el usuario de auth — ${error?.message}`);
      huboErrores = true;
      continue;
    }

    const { error: perfilError } = await supabase.from("usuarios").insert({
      id: data.user.id,
      username: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
    });

    if (perfilError) {
      // Sin perfil el usuario de auth no sirve para nada y bloquearía el
      // username: se borra para poder reintentar el alta limpia.
      await supabase.auth.admin.deleteUser(data.user.id);
      console.error(`✗ ${usuario.username}: falló el perfil, se revirtió el alta — ${perfilError.message}`);
      huboErrores = true;
      continue;
    }

    console.log(`✓ ${usuario.username} (${usuario.rol}) — contraseña dev: ${usuario.passwordDev}`);
  }

  if (huboErrores) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
