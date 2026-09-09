import QRCode from "qrcode";
import { contenidoQr } from "@lbm/shared";

export interface DatosCartel {
  codigo: string;
  nombre: string;
  localidad: string;
}

// El cartel se dibuja en milímetros para que salga del tamaño real al
// imprimirlo, sin depender de la escala que elija cada impresora.
const ANCHO_MM = 70;
const ALTO_MM = 90;
const LADO_QR_MM = 48;

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function acortar(texto: string, maximo: number): string {
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto;
}

function caminoDelQr(texto: string): { camino: string; modulos: number } {
  // Nivel Q (25% de recuperación): el cartel vive pegado en la pared de un
  // comercio y se ensucia, se raya o se despega de una punta.
  const qr = QRCode.create(texto, { errorCorrectionLevel: "Q" });
  const modulos = qr.modules.size;
  const datos = qr.modules.data;

  let camino = "";
  for (let y = 0; y < modulos; y++) {
    for (let x = 0; x < modulos; x++) {
      if (datos[y * modulos + x]) camino += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { camino, modulos };
}

/** Cartel imprimible con el QR del comercio, listo para pegar en el local. */
export function cartelQr(comercio: DatosCartel): string {
  const { camino, modulos } = caminoDelQr(contenidoQr(comercio.codigo));
  const escala = LADO_QR_MM / modulos;
  const margenQr = (ANCHO_MM - LADO_QR_MM) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO_MM}mm" height="${ALTO_MM}mm" viewBox="0 0 ${ANCHO_MM} ${ALTO_MM}" role="img" aria-label="QR de ${escaparXml(comercio.codigo)}">
  <rect width="${ANCHO_MM}" height="${ALTO_MM}" fill="#ffffff"/>
  <rect x="1" y="1" width="${ANCHO_MM - 2}" height="${ALTO_MM - 2}" fill="none" stroke="#d6d3d1" stroke-width="0.3" stroke-dasharray="1.5 1.5"/>
  <text x="${ANCHO_MM / 2}" y="10" text-anchor="middle" font-family="system-ui, sans-serif" font-size="3.4" letter-spacing="0.6" fill="#78716c">LA BUENA MEDIDA</text>
  <g transform="translate(${margenQr} 15) scale(${escala})">
    <path d="${camino}" fill="#1c1917"/>
  </g>
  <text x="${ANCHO_MM / 2}" y="74" text-anchor="middle" font-family="system-ui, sans-serif" font-size="9" font-weight="700" fill="#1c1917">${escaparXml(comercio.codigo)}</text>
  <text x="${ANCHO_MM / 2}" y="80" text-anchor="middle" font-family="system-ui, sans-serif" font-size="3.6" fill="#44403c">${escaparXml(acortar(comercio.nombre, 34))}</text>
  <text x="${ANCHO_MM / 2}" y="85" text-anchor="middle" font-family="system-ui, sans-serif" font-size="3" fill="#a8a29e">${escaparXml(acortar(comercio.localidad, 34))}</text>
</svg>`;
}

/** Deja el código apto para usarse en un nombre de archivo y en un header HTTP. */
export function nombreArchivoQr(codigo: string): string {
  return `qr-${codigo.replace(/[^A-Za-z0-9_-]/g, "")}.svg`;
}
