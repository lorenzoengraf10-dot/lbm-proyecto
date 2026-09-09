import { normalizarCodigoComercio } from "./comercios";

// El QR guarda el código del comercio con un prefijo propio, en texto plano.
// No es una URL: escanearlo con la cámara del celular no lleva a ningún lado,
// solo la app del vendedor sabe interpretarlo. El prefijo además permite
// descartar de una cualquier otro QR que llegue a la cámara (el código de
// barras de un producto, por ejemplo).
export const PREFIJO_QR = "LBM:";

export function contenidoQr(codigo: string): string {
  return `${PREFIJO_QR}${normalizarCodigoComercio(codigo)}`;
}

/** Devuelve el código del comercio, o null si el QR no es de este sistema. */
export function leerContenidoQr(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio.toUpperCase().startsWith(PREFIJO_QR)) return null;

  const codigo = normalizarCodigoComercio(limpio.slice(PREFIJO_QR.length));
  return codigo || null;
}
