// PIN de desbloqueo rápido, adaptado de docs/PLAN.md §2.1 a un navegador (el
// diseño original pensaba en almacenamiento seguro nativo de un celular con
// Expo). El PIN nunca viaja a ningún servidor: se guarda hasheado en
// localStorage de ESTE dispositivo, junto con un salt propio, y solo sirve
// para desbloquear localmente una sesión de Supabase que ya inició con la
// credencial real. Perder el PIN no expone nada: sin el dispositivo no hay
// forma de usarlo, y el hash no alcanza para reconstruirlo.

const CLAVE_STORAGE = "lbm_vendedor_pin";

export const LARGO_PIN = 4;
export const MAX_INTENTOS_PIN = 5;

interface RegistroPin {
  hash: string;
  salt: string;
  intentosFallidos: number;
}

function leerRegistro(): RegistroPin | null {
  try {
    const crudo = localStorage.getItem(CLAVE_STORAGE);
    return crudo ? (JSON.parse(crudo) as RegistroPin) : null;
  } catch {
    return null;
  }
}

function guardarRegistro(registro: RegistroPin | null): void {
  try {
    if (registro) localStorage.setItem(CLAVE_STORAGE, JSON.stringify(registro));
    else localStorage.removeItem(CLAVE_STORAGE);
  } catch {
    // Sin localStorage disponible (modo privado, storage lleno) el candado no
    // puede guardar nada: la próxima vez vuelve a pedir el login completo.
  }
}

function bytesAHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashear(pin: string, salt: string): Promise<string> {
  const datos = new TextEncoder().encode(`${salt}:${pin}`);
  const buffer = await crypto.subtle.digest("SHA-256", datos);
  return bytesAHex(new Uint8Array(buffer));
}

function generarSalt(): string {
  return bytesAHex(crypto.getRandomValues(new Uint8Array(16)));
}

export function hayPinConfigurado(): boolean {
  return leerRegistro() !== null;
}

export async function configurarPin(pin: string): Promise<void> {
  const salt = generarSalt();
  const hash = await hashear(pin, salt);
  guardarRegistro({ hash, salt, intentosFallidos: 0 });
}

export function borrarPin(): void {
  guardarRegistro(null);
}

export async function verificarPin(pin: string): Promise<{ ok: boolean; intentosRestantes: number }> {
  const registro = leerRegistro();
  if (!registro) return { ok: false, intentosRestantes: 0 };

  const hash = await hashear(pin, registro.salt);
  if (hash === registro.hash) {
    guardarRegistro({ ...registro, intentosFallidos: 0 });
    return { ok: true, intentosRestantes: MAX_INTENTOS_PIN };
  }

  const intentosFallidos = registro.intentosFallidos + 1;
  if (intentosFallidos >= MAX_INTENTOS_PIN) {
    // Después de 5 fallos seguidos se borra la sesión local: hay que repetir
    // el login completo con la credencial real (que solo la tiene el admin).
    borrarPin();
    return { ok: false, intentosRestantes: 0 };
  }

  guardarRegistro({ ...registro, intentosFallidos });
  return { ok: false, intentosRestantes: MAX_INTENTOS_PIN - intentosFallidos };
}
