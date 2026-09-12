export const LARGO_PIN = 6;
export const MAX_INTENTOS_PIN = 5;
/** Minutos que queda bloqueada la cuenta después de agotar los intentos. */
export const MINUTOS_BLOQUEO = 15;

const SOLO_DIGITOS = /^\d+$/;

/**
 * PIN demasiado fácil de adivinar. Con seis dígitos hay un millón de
 * combinaciones, pero si el repartidor elige 123456 o 111111 eso no sirve de
 * nada: son los primeros que prueba cualquiera.
 */
function esObvio(pin: string): boolean {
  if (/^(\d)\1*$/.test(pin)) return true; // 000000, 111111…

  const digitos = [...pin].map(Number);
  const subeDeAUno = digitos.every((d, i) => i === 0 || d === digitos[i - 1] + 1);
  const bajaDeAUno = digitos.every((d, i) => i === 0 || d === digitos[i - 1] - 1);
  if (subeDeAUno || bajaDeAUno) return true; // 123456, 654321

  // 121212, 123123: un pedacito que se repite.
  return ["12", "123"].some((largo) => {
    const trozo = pin.slice(0, largo.length);
    return pin.length % trozo.length === 0 && trozo.repeat(pin.length / trozo.length) === pin;
  });
}

/** Devuelve el problema del PIN, o null si sirve. */
export function validarPin(pin: string): string | null {
  if (pin.length !== LARGO_PIN) return `El PIN tiene que ser de ${LARGO_PIN} números.`;
  if (!SOLO_DIGITOS.test(pin)) return "El PIN solo puede tener números.";
  if (esObvio(pin)) return "Ese PIN es muy fácil de adivinar. Elegí otro.";
  return null;
}

/**
 * La contraseña real de Supabase Auth para un repartidor, derivada de su PIN.
 *
 * Es lo que hace que un PIN de seis dígitos sea aceptable: la contraseña que
 * viaja a Auth no es "483920" sino un HMAC de 64 caracteres que depende de un
 * secreto que solo conoce el servidor. Sin ese secreto nadie puede armar
 * contraseñas candidatas, así que no se puede probar PIN contra el endpoint de
 * Auth — hay que pasar por la app, donde los intentos se cuentan y se frenan.
 *
 * Va con Web Crypto (no node:crypto) para que el módulo siga sirviendo en los
 * dos lados; igual el secreto solo existe en el servidor, que es quien la llama.
 *
 * OJO: el secreto no se puede cambiar sin invalidar todos los PIN. Si alguna
 * vez hay que rotarlo, hay que volver a fijarle el PIN a cada repartidor.
 */
export async function derivarPassword(
  pin: string,
  usuarioId: string,
  secreto: string
): Promise<string> {
  const codificador = new TextEncoder();
  const clave = await crypto.subtle.importKey(
    "raw",
    codificador.encode(`lbm-pin-v1:${secreto}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const firma = await crypto.subtle.sign("HMAC", clave, codificador.encode(`${usuarioId}:${pin}`));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
