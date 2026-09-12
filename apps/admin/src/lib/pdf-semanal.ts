import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatearCantidad, formatearComision, formatearPrecio } from "./formato";
import type { ReporteSemanal } from "./reporte-semanal";
import { etiquetaSemana, type Semana } from "./semana";

// pdf-lib y no pdfkit: es JS puro, sin archivos de fuentes que leer del disco
// ni binarios, así que funciona igual en la función serverless de Vercel.

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 48;
const NEGRO = rgb(0.11, 0.1, 0.09);
const GRIS = rgb(0.45, 0.43, 0.41);

// Las fuentes estándar del PDF codifican WinAnsi: un carácter fuera de
// Latin-1 (un emoji pegado en el nombre de un comercio, una comilla rara de
// un copiar y pegar) haría fallar la generación entera con un 500. Mejor que
// salga un signo de pregunta y el reporte se descargue igual.
function limpiar(texto: string): string {
  return texto.replace(/[^ -ÿ]/g, "?");
}

class Lienzo {
  private pagina: PDFPage;
  private y: number;

  constructor(
    private documento: PDFDocument,
    private normal: PDFFont,
    private negrita: PDFFont
  ) {
    this.pagina = documento.addPage([A4.ancho, A4.alto]);
    this.y = A4.alto - MARGEN;
  }

  private asegurarEspacio(alto: number) {
    if (this.y - alto >= MARGEN) return;
    this.pagina = this.documento.addPage([A4.ancho, A4.alto]);
    this.y = A4.alto - MARGEN;
  }

  espacio(alto: number) {
    this.y -= alto;
  }

  texto(
    contenido: string,
    opciones: { x?: number; tamano?: number; negrita?: boolean; color?: ReturnType<typeof rgb> } = {}
  ) {
    const tamano = opciones.tamano ?? 10;
    this.asegurarEspacio(tamano + 4);
    this.pagina.drawText(limpiar(contenido), {
      x: opciones.x ?? MARGEN,
      y: this.y - tamano,
      size: tamano,
      font: opciones.negrita ? this.negrita : this.normal,
      color: opciones.color ?? NEGRO,
    });
    this.y -= tamano + 4;
  }

  titulo(contenido: string) {
    this.espacio(10);
    this.texto(contenido, { tamano: 12, negrita: true });
    this.espacio(2);
  }

  /** Fila de columnas alineadas: la última a la derecha del ancho útil. */
  fila(celdas: { texto: string; x: number; derecha?: boolean }[], negrita = false) {
    const tamano = 10;
    this.asegurarEspacio(tamano + 5);
    for (const celda of celdas) {
      const fuente = negrita ? this.negrita : this.normal;
      const texto = limpiar(celda.texto);
      const ancho = fuente.widthOfTextAtSize(texto, tamano);
      this.pagina.drawText(texto, {
        x: celda.derecha ? celda.x - ancho : celda.x,
        y: this.y - tamano,
        size: tamano,
        font: fuente,
        color: negrita ? NEGRO : GRIS,
      });
    }
    this.y -= tamano + 5;
  }
}

export async function pdfSemanal(semana: Semana, reporte: ReporteSemanal): Promise<Uint8Array> {
  const documento = await PDFDocument.create();
  const normal = await documento.embedFont(StandardFonts.Helvetica);
  const negrita = await documento.embedFont(StandardFonts.HelveticaBold);
  const lienzo = new Lienzo(documento, normal, negrita);

  const derecha = A4.ancho - MARGEN;
  const columnaMedia = MARGEN + 300;

  lienzo.texto("La Buena Medida", { tamano: 16, negrita: true });
  lienzo.texto(`Reporte semanal · ${etiquetaSemana(semana)}`, { tamano: 11, color: GRIS });

  lienzo.titulo("Resumen");
  lienzo.fila([
    { texto: "Total facturado", x: MARGEN },
    { texto: formatearPrecio(reporte.totalFacturado), x: columnaMedia, derecha: true },
  ]);
  lienzo.fila([
    { texto: "Pedidos", x: MARGEN },
    { texto: String(reporte.cantidadPedidos), x: columnaMedia, derecha: true },
  ]);
  lienzo.fila([
    { texto: "Comisiones a pagar", x: MARGEN },
    { texto: formatearPrecio(reporte.totalComisiones), x: columnaMedia, derecha: true },
  ]);

  lienzo.titulo("Por vendedor");
  if (reporte.vendedores.length === 0) {
    lienzo.texto("Sin ventas en la semana.", { color: GRIS });
  } else {
    lienzo.fila(
      [
        { texto: "Vendedor", x: MARGEN },
        { texto: "Pedidos", x: MARGEN + 240, derecha: true },
        { texto: "Vendido", x: MARGEN + 380, derecha: true },
        { texto: "Comisión", x: derecha, derecha: true },
      ],
      true
    );
    for (const fila of reporte.vendedores) {
      lienzo.fila([
        { texto: fila.nombre, x: MARGEN },
        { texto: String(fila.pedidos), x: MARGEN + 240, derecha: true },
        { texto: formatearPrecio(fila.totalVendido), x: MARGEN + 380, derecha: true },
        {
          texto: `${formatearPrecio(fila.comision)} (${formatearComision(fila.comisionPct)}${fila.comisionPctVarios ? " y otro" : ""})`,
          x: derecha,
          derecha: true,
        },
      ]);
    }
  }

  lienzo.titulo("Por producto");
  if (reporte.productos.length === 0) {
    lienzo.texto("Sin ventas en la semana.", { color: GRIS });
  } else {
    lienzo.fila(
      [
        { texto: "Producto", x: MARGEN },
        { texto: "Cantidad", x: MARGEN + 340, derecha: true },
        { texto: "Importe", x: derecha, derecha: true },
      ],
      true
    );
    for (const fila of reporte.productos) {
      lienzo.fila([
        { texto: fila.nombre, x: MARGEN },
        { texto: `${formatearCantidad(fila.cantidad)} ${fila.unidad}`, x: MARGEN + 340, derecha: true },
        { texto: formatearPrecio(fila.importe), x: derecha, derecha: true },
      ]);
    }
  }

  lienzo.titulo("Cobertura");
  lienzo.fila([
    { texto: "Comercios visitados", x: MARGEN },
    {
      texto: `${reporte.cobertura.visitados} de ${reporte.cobertura.activos}`,
      x: columnaMedia,
      derecha: true,
    },
  ]);
  lienzo.fila([
    { texto: "Visitas registradas", x: MARGEN },
    { texto: String(reporte.cobertura.visitas), x: columnaMedia, derecha: true },
  ]);

  if (reporte.cobertura.noVisitados.length > 0) {
    lienzo.espacio(6);
    lienzo.texto(`Sin visitar esta semana (${reporte.cobertura.noVisitados.length}):`, {
      negrita: true,
    });
    for (const comercio of reporte.cobertura.noVisitados) {
      lienzo.texto(`${comercio.codigo} · ${comercio.nombre}`, { color: GRIS });
    }
  }

  return documento.save();
}
