import "server-only";
import { contenidoQr } from "@lbm/shared";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { caminoDelQr, type DatosCartel } from "./qr";

// Mismo criterio que el reporte semanal: pdf-lib es JS puro, sin fuentes que
// leer del disco, así que funciona igual en la función serverless de Vercel.
//
// Los carteles salen del mismo tamaño real que la hoja HTML para imprimir
// (7×9 cm), para que el que ya pegó unos cuantos no se encuentre con que los
// nuevos no coinciden.

const MM = 2.834645669; // 1 mm en puntos PDF
const A4 = { ancho: 595.28, alto: 841.89 };
const CARTEL = { ancho: 70 * MM, alto: 90 * MM };
const LADO_QR = 48 * MM;
const COLUMNAS = 2;
const FILAS = 3;

const NEGRO = rgb(0.11, 0.1, 0.09);
const GRIS = rgb(0.27, 0.25, 0.24);
const GRIS_CLARO = rgb(0.66, 0.64, 0.62);
const LINEA_CORTE = rgb(0.84, 0.83, 0.82);

// Las fuentes estándar del PDF codifican WinAnsi: los acentos y la ñ entran,
// pero un emoji o una comilla rara pegada desde el celular haría fallar la
// generación entera con un 500. Mejor que salga un signo de pregunta.
function limpiar(texto: string): string {
  return texto.replace(/[^ -ÿ]/g, "?");
}

/** Centra el texto y lo achica (y si no alcanza, lo corta) para que entre. */
function textoCentrado(
  pagina: PDFPage,
  texto: string,
  opciones: {
    centro: number;
    y: number;
    tamano: number;
    tamanoMinimo?: number;
    anchoMaximo: number;
    fuente: PDFFont;
    color: ReturnType<typeof rgb>;
  }
) {
  const { centro, y, anchoMaximo, fuente, color } = opciones;
  let contenido = limpiar(texto);
  let tamano = opciones.tamano;
  const minimo = opciones.tamanoMinimo ?? tamano;

  while (tamano > minimo && fuente.widthOfTextAtSize(contenido, tamano) > anchoMaximo) {
    tamano -= 0.25;
  }
  while (contenido.length > 1 && fuente.widthOfTextAtSize(contenido, tamano) > anchoMaximo) {
    contenido = `${contenido.slice(0, -2)}…`;
  }

  pagina.drawText(contenido, {
    x: centro - fuente.widthOfTextAtSize(contenido, tamano) / 2,
    y,
    size: tamano,
    font: fuente,
    color,
  });
}

function dibujarCartel(
  pagina: PDFPage,
  comercio: DatosCartel,
  origen: { x: number; y: number },
  fuentes: { normal: PDFFont; negrita: PDFFont }
) {
  const centro = origen.x + CARTEL.ancho / 2;
  // El origen del PDF está abajo a la izquierda; el borde superior del cartel
  // queda en origen.y + alto.
  const arriba = origen.y + CARTEL.alto;

  // Línea de corte punteada.
  pagina.drawRectangle({
    x: origen.x + 1 * MM,
    y: origen.y + 1 * MM,
    width: CARTEL.ancho - 2 * MM,
    height: CARTEL.alto - 2 * MM,
    borderColor: LINEA_CORTE,
    borderWidth: 0.5,
    borderDashArray: [3, 3],
  });

  textoCentrado(pagina, "LA BUENA MEDIDA", {
    centro,
    y: arriba - 10 * MM,
    tamano: 7,
    anchoMaximo: CARTEL.ancho - 8 * MM,
    fuente: fuentes.normal,
    color: GRIS_CLARO,
  });

  const { camino, modulos } = caminoDelQr(contenidoQr(comercio.codigo));
  pagina.drawSvgPath(camino, {
    // drawSvgPath toma (x, y) como la esquina superior izquierda y crece
    // hacia abajo, al revés que el resto de las primitivas de pdf-lib.
    x: origen.x + (CARTEL.ancho - LADO_QR) / 2,
    y: arriba - 15 * MM,
    scale: LADO_QR / modulos,
    color: NEGRO,
    borderWidth: 0,
  });

  // El código del comercio es lo que más se mira de lejos: grande y en negrita.
  textoCentrado(pagina, comercio.codigo, {
    centro,
    y: origen.y + 16 * MM,
    tamano: 26,
    tamanoMinimo: 14,
    anchoMaximo: CARTEL.ancho - 8 * MM,
    fuente: fuentes.negrita,
    color: NEGRO,
  });

  textoCentrado(pagina, comercio.nombre, {
    centro,
    y: origen.y + 10 * MM,
    tamano: 10,
    tamanoMinimo: 6,
    anchoMaximo: CARTEL.ancho - 6 * MM,
    fuente: fuentes.normal,
    color: GRIS,
  });

  textoCentrado(pagina, comercio.localidad, {
    centro,
    y: origen.y + 5.5 * MM,
    tamano: 8,
    tamanoMinimo: 5,
    anchoMaximo: CARTEL.ancho - 6 * MM,
    fuente: fuentes.normal,
    color: GRIS_CLARO,
  });
}

/** Una hoja A4 cada seis comercios, lista para imprimir y recortar. */
export async function pdfCartelesQr(comercios: DatosCartel[]): Promise<Uint8Array> {
  const documento = await PDFDocument.create();
  const fuentes = {
    normal: await documento.embedFont(StandardFonts.Helvetica),
    negrita: await documento.embedFont(StandardFonts.HelveticaBold),
  };

  const margenX = (A4.ancho - COLUMNAS * CARTEL.ancho) / 2;
  const margenY = (A4.alto - FILAS * CARTEL.alto) / 2;
  const porHoja = COLUMNAS * FILAS;

  if (comercios.length === 0) {
    const pagina = documento.addPage([A4.ancho, A4.alto]);
    textoCentrado(pagina, "No hay comercios activos para imprimir.", {
      centro: A4.ancho / 2,
      y: A4.alto / 2,
      tamano: 12,
      anchoMaximo: A4.ancho - 80,
      fuente: fuentes.normal,
      color: GRIS,
    });
    return documento.save();
  }

  let pagina: PDFPage | null = null;
  comercios.forEach((comercio, i) => {
    const posicion = i % porHoja;
    if (posicion === 0) pagina = documento.addPage([A4.ancho, A4.alto]);

    const columna = posicion % COLUMNAS;
    const fila = Math.floor(posicion / COLUMNAS);

    dibujarCartel(
      pagina as PDFPage,
      comercio,
      {
        x: margenX + columna * CARTEL.ancho,
        // Las filas se llenan de arriba hacia abajo, pero el eje Y del PDF
        // crece hacia arriba.
        y: A4.alto - margenY - (fila + 1) * CARTEL.alto,
      },
      fuentes
    );
  });

  return documento.save();
}
