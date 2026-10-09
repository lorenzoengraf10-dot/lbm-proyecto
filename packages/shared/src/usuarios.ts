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

/**
 * Lo que se le dice a quien intenta entrar cuando el problema no es su
 * credencial sino que el servidor no contestó.
 */
export const MENSAJE_SIN_CONEXION =
  "No se pudo conectar con el servidor. Probá de nuevo en un rato; si sigue, avisale al dueño.";

/**
 * ¿Supabase Auth rechazó la credencial, o directamente no se pudo hablar con
 * él?
 *
 * Importa porque se confundían. Con la base en pausa (le pasó al proyecto en
 * octubre: el plan gratuito la duerme tras una semana sin uso), el login decía
 * "PIN incorrecto", contaba el intento como fallido y acercaba al usuario al
 * bloqueo — por un PIN que estaba bien. Solo un 400 es "eso no es": usuario o
 * contraseña equivocados, o cuenta sin confirmar. Un 5xx, un 429, o una
 * conexión que ni llegó (status 0 o ausente) es otra cosa, y no tiene que
 * castigar a nadie.
 */
export function esCredencialInvalida(error: { status?: number } | null | undefined): boolean {
  return error?.status === 400;
}
