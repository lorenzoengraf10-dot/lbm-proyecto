// Supabase Auth requiere un email por cuenta, pero los vendedores no usan
// email: se loguean con un "usuario" y por debajo se mapea a esta dirección
// interna, que nunca ven ni recibe correo.
export const DOMINIO_EMAIL_INTERNO = "lbm.local";

const FORMATO_USERNAME = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/;

export function normalizarUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validarUsername(username: string): string | null {
  const normalizado = normalizarUsername(username);

  if (normalizado.length < 3 || normalizado.length > 30) {
    return "El usuario tiene que tener entre 3 y 30 caracteres.";
  }
  if (!FORMATO_USERNAME.test(normalizado)) {
    return "El usuario solo puede tener letras, números, punto, guion y guion bajo (sin espacios ni acentos).";
  }
  return null;
}

export function emailInterno(username: string): string {
  return `${normalizarUsername(username)}@${DOMINIO_EMAIL_INTERNO}`;
}
