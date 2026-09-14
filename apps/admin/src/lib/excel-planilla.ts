import "server-only";

import ExcelJS from "exceljs";
import { etiquetaDiaLargo } from "./fechas";
import { formatearCantidad } from "./formato";
import type { PlanillaDia } from "./planilla-dia";

const FILA_ENCABEZADOS = 4;

const FORMATO_CANTIDAD = "#,##0.##";
const FORMATO_PESOS = '"$"#,##0.00';

const GRIS = "FFF5F5F4";
const APAGADO = "FF78716C";
const BORDE = { style: "thin" as const, color: { argb: "FFD6D3D1" } };

/**
 * La planilla del día en Excel, pensada para imprimir en A4: una fila por
 * comercio con el código, el nombre y lo que pidió escrito un producto atrás
 * del otro, y abajo el resumen de lo que hay que preparar.
 *
 * Sale de los mismos números que la pantalla (armarPlanillaDia), así que no
 * pueden discrepar.
 */
export async function excelPlanillaDia(planilla: PlanillaDia): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "La Buena Medida";
  libro.created = new Date();

  // El nombre de la hoja no admite / \ ? * [ ] y se corta a 31 caracteres.
  const hoja = libro.addWorksheet(`Pedidos ${planilla.dia.replaceAll("-", "")}`);

  // Cada celda tiene que dar para el pedido más largo del día ("Queso cremoso
  // 2,5 kg"), sin pasarse: cada carácter de más es ancho que se le quita a la
  // hoja impresa.
  const masLargo = planilla.filas.reduce(
    (largo, fila) => fila.lineas.reduce((maximo, linea) => Math.max(maximo, linea.texto.length), largo),
    0
  );
  const anchoPedido = Math.min(22, Math.max(12, masLargo + 2));

  // Cuántas celdas de pedido entran a lo ancho de un A4 apaisado.
  //
  // Poner una columna por producto del que más pidió parecía lo natural, pero
  // un comercio que pide dieciocho productos hacía una hoja tan ancha que al
  // imprimirla Excel la achicaba a la mitad y no se leía nada. Así que el
  // ancho se fija y al que pidió de más se le sigue el pedido en el renglón
  // de abajo. En caracteres: el A4 da para unos 150 a tamaño natural; con 185
  // queda una reducción suave que todavía se lee bien.
  const ANCHO_HOJA = 185;
  const celdasPorFila = Math.max(
    3,
    Math.floor((ANCHO_HOJA - 8 - 26 - 13) / anchoPedido)
  );
  // No hacen falta más celdas que productos pidió el que más pidió. Al menos
  // una, para que la hoja de un día sin pedidos siga teniendo forma de tabla.
  const celdasPedido = Math.max(1, Math.min(celdasPorFila, planilla.maxLineas));
  const primerPedido = 3;
  const columnaPesos = primerPedido + celdasPedido;

  hoja.columns = [
    { key: "codigo", width: 8 },
    { key: "nombre", width: 28 },
    ...Array.from({ length: celdasPedido }, (_, i) => ({ key: `p${i}`, width: anchoPedido })),
    { key: "pesos", width: 13 },
  ];

  const titulo = hoja.getCell("A1");
  titulo.value = `Pedidos del ${etiquetaDiaLargo(planilla.dia)}`;
  titulo.font = { bold: true, size: 14 };

  const porUnidad = planilla.unidades
    .map((unidad) => `${formatearCantidad(planilla.totales[unidad.clave] ?? 0)} ${unidad.corta}`)
    .join(" · ");
  const resumen = hoja.getCell("A2");
  resumen.value =
    `${planilla.cuantosPidieron} de ${planilla.filas.length} comercios pidieron` +
    (porUnidad ? ` · ${porUnidad}` : "");
  resumen.font = { size: 10, color: { argb: APAGADO } };

  const filaEncabezados = hoja.getRow(FILA_ENCABEZADOS);
  filaEncabezados.values = ["Código", "Comercio", "Pedido", ...Array(celdasPedido - 1).fill(""), "Total $"];
  filaEncabezados.font = { bold: true };
  filaEncabezados.height = 20;
  // "Pedido" va de punta a punta de las celdas del pedido: cada una lleva un
  // producto distinto, así que ponerles número o nombre no querría decir nada.
  if (celdasPedido > 1) {
    hoja.mergeCells(FILA_ENCABEZADOS, primerPedido, FILA_ENCABEZADOS, columnaPesos - 1);
  }
  for (let columna = 1; columna <= columnaPesos; columna++) {
    const celda = filaEncabezados.getCell(columna);
    celda.alignment = { vertical: "middle", horizontal: "left" };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    celda.border = { bottom: BORDE };
  }

  for (const fila of planilla.filas) {
    // El pedido se parte en renglones de a celdasPedido: al que pidió mucho se
    // le sigue abajo en vez de estirar la hoja.
    const renglones = Math.max(1, Math.ceil(fila.lineas.length / celdasPedido));
    for (let renglon = 0; renglon < renglones; renglon++) {
      const desde = renglon * celdasPedido;
      const primero = renglon === 0;
      const agregada = hoja.addRow([
        fila.codigo,
        primero ? (fila.activo ? fila.nombre : `${fila.nombre} (dado de baja)`) : "",
        ...Array.from({ length: celdasPedido }, (_, i) => fila.lineas[desde + i]?.texto ?? null),
        // El total del comercio va en su primer renglón, y vacío si no pidió:
        // un cero se lee como "compró por cero pesos".
        primero && fila.pidio ? fila.totalPesos : null,
      ]);
      agregada.getCell(columnaPesos).numFmt = FORMATO_PESOS;
      // El nombre se pliega en dos renglones si hace falta: "Almacén de Ramos
      // Generales y Fiambrería del Puerto Viejo" no entra de una y, sin
      // plegarlo, la celda del pedido de al lado se lo comía a la mitad.
      agregada.getCell(2).alignment = { wrapText: true, vertical: "top" };
      for (let columna = primerPedido; columna < columnaPesos; columna++) {
        // shrinkToFit: si el dueño le puso una abreviatura larga, el texto se
        // achica un poco en vez de salir cortado por la celda de al lado.
        agregada.getCell(columna).alignment = { vertical: "top", shrinkToFit: true };
      }
      agregada.getCell(columnaPesos).alignment = { vertical: "top" };
      if (!primero) {
        // El código se repite apagado: si el corte de página cae justo acá,
        // el renglón suelto igual se sabe de quién es.
        agregada.getCell(1).font = { color: { argb: APAGADO } };
      }
    }
  }

  // ---- Lo que hay que preparar ----
  // El resumen del día, un renglón por producto y con el nombre completo: de
  // paso aclara qué quiere decir cada abreviatura de arriba.
  // El nombre ocupa todo el ancho hasta las dos últimas columnas, que llevan
  // la cantidad y la unidad. Sin unir las celdas, un nombre largo se derrama
  // sobre el número de al lado y en la hoja impresa quedan encimados.
  // Pegadas al nombre y no al final de la hoja: con veinte columnas de pedido,
  // leer un renglón del resumen era cruzar la hoja entera con el dedo.
  const colCantidad = Math.min(columnaPesos - 1, primerPedido + 2);
  const colUnidad = colCantidad + 1;
  const unirNombre = (fila: ExcelJS.Row) => {
    if (colCantidad > 2) hoja.mergeCells(fila.number, 1, fila.number, colCantidad - 1);
  };

  hoja.addRow([]);
  const tituloPreparar = hoja.addRow(["Para preparar"]);
  tituloPreparar.font = { bold: true };
  unirNombre(tituloPreparar);
  for (let columna = 1; columna <= colUnidad; columna++) {
    tituloPreparar.getCell(columna).border = { bottom: BORDE };
  }

  for (const linea of planilla.preparar) {
    const fila = hoja.addRow([]);
    // Entre paréntesis va cómo se llama corto arriba, así el que mira la hoja
    // impresa puede confirmar qué es cada abreviatura sin preguntarle a nadie.
    fila.getCell(1).value =
      linea.corto === linea.nombre ? linea.nombre : `${linea.nombre} (${linea.corto})`;
    unirNombre(fila);
    fila.getCell(colCantidad).value = linea.cantidad;
    fila.getCell(colCantidad).numFmt = FORMATO_CANTIDAD;
    fila.getCell(colCantidad).alignment = { horizontal: "right" };
    fila.getCell(colUnidad).value = linea.unidad;
  }

  const totalPreparar = hoja.addRow([]);
  totalPreparar.getCell(1).value = "Total";
  unirNombre(totalPreparar);
  totalPreparar.getCell(colCantidad).value = porUnidad;
  totalPreparar.getCell(colCantidad).alignment = { horizontal: "right" };
  if (colUnidad > colCantidad) {
    hoja.mergeCells(totalPreparar.number, colCantidad, totalPreparar.number, colUnidad);
  }
  totalPreparar.font = { bold: true };
  const ultimaFila = totalPreparar.number;

  // Con la cartera entera hay que scrollear: que los encabezados y el código
  // queden fijos es la diferencia entre poder leerla y no.
  hoja.views = [{ state: "frozen", xSplit: 2, ySplit: FILA_ENCABEZADOS }];

  // Para imprimir: A4 apaisado, todo el ancho en una sola hoja y tantas hojas
  // de alto como haga falta. Los encabezados se repiten arriba de cada página,
  // que si no la segunda hoja son pedidos sueltos sin saber de quién.
  hoja.pageSetup = {
    printArea: `A1:${hoja.getColumn(columnaPesos).letter}${ultimaFila}`,
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printTitlesRow: `${FILA_ENCABEZADOS}:${FILA_ENCABEZADOS}`,
    showGridLines: true,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
  hoja.headerFooter = { oddFooter: "&L&F&RPágina &P de &N" };

  // ExcelJS devuelve un Buffer de Node; Response lo acepta igual.
  return libro.xlsx.writeBuffer();
}
