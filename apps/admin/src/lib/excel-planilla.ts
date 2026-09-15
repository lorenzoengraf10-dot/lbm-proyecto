import "server-only";

import ExcelJS from "exceljs";
import { etiquetaDiaLargo } from "./fechas";
import { formatearCantidad } from "./formato";
import type { Planilla } from "./planilla";

const FILA_ENCABEZADOS = 4;

// Las columnas fijas, por número, y cada una derivada de la anterior.
//
// Antes esto eran literales sueltos —getCell(1), getCell(2), un 3 escrito a
// mano— y ahí está el problema: si mañana se antepone una columna, el
// compilador no dice una palabra y la hoja sale corrida. No se rompe nada
// visible en pantalla; se descubre recién con la hoja impresa en la mano.
const COL_CODIGO = 1;
const COL_NOMBRE = COL_CODIGO + 1;
const PRIMER_PEDIDO = COL_NOMBRE + 1;

const ANCHO_CODIGO = 8;
const ANCHO_NOMBRE = 28;
const ANCHO_PESOS = 13;

// Lo que da a lo ancho un A4 apaisado, en caracteres: a tamaño natural entran
// unos 150; con 185 la reducción es suave y todavía se lee bien.
const ANCHO_HOJA = 185;

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
 * Sale de los mismos números que la pantalla (armarPlanilla), así que no
 * pueden discrepar.
 */
export async function excelPlanilla(planilla: Planilla): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "La Buena Medida";
  libro.created = new Date();

  // El nombre de la hoja no admite / \ ? * [ ] y se corta a 31 caracteres.
  const hoja = libro.addWorksheet(`Pedidos ${planilla.desde.replaceAll("-", "")}`);

  // Cada celda tiene que dar para el pedido más largo del día ("Queso cremoso
  // 2,5 kg"), sin pasarse: cada carácter de más es ancho que se le quita a la
  // hoja impresa.
  const masLargo = planilla.filas.reduce(
    (largo, fila) => fila.lineas.reduce((maximo, linea) => Math.max(maximo, linea.texto.length), largo),
    0
  );
  const anchoPedido = Math.min(22, Math.max(12, masLargo + 2));

  // Cuántas celdas de pedido entran a lo ancho de la hoja.
  //
  // Poner una columna por producto del que más pidió parecía lo natural, pero
  // un comercio que pide dieciocho productos hacía una hoja tan ancha que al
  // imprimirla Excel la achicaba a la mitad y no se leía nada. Así que el
  // ancho se fija y al que pidió de más se le sigue el pedido en el renglón
  // de abajo.
  const celdasPorFila = Math.max(
    3,
    Math.floor((ANCHO_HOJA - ANCHO_CODIGO - ANCHO_NOMBRE - ANCHO_PESOS) / anchoPedido)
  );
  // No hacen falta más celdas que productos pidió el que más pidió. Al menos
  // una, para que la hoja de un día sin pedidos siga teniendo forma de tabla.
  const celdasPedido = Math.max(1, Math.min(celdasPorFila, planilla.maxLineas));
  const columnaPesos = PRIMER_PEDIDO + celdasPedido;

  // Los anchos se asignan antes del primer addRow: en ExcelJS, pisar
  // hoja.columns después borra lo que ya se escribió.
  hoja.columns = [
    { key: "codigo", width: ANCHO_CODIGO },
    { key: "nombre", width: ANCHO_NOMBRE },
    ...Array.from({ length: celdasPedido }, (_, i) => ({ key: `p${i}`, width: anchoPedido })),
    { key: "pesos", width: ANCHO_PESOS },
  ];

  const titulo = hoja.getCell("A1");
  titulo.value = `Pedidos del ${etiquetaDiaLargo(planilla.desde)}`;
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
    hoja.mergeCells(FILA_ENCABEZADOS, PRIMER_PEDIDO, FILA_ENCABEZADOS, columnaPesos - 1);
  }
  for (let columna = COL_CODIGO; columna <= columnaPesos; columna++) {
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
      agregada.getCell(COL_NOMBRE).alignment = { wrapText: true, vertical: "top" };
      for (let columna = PRIMER_PEDIDO; columna < columnaPesos; columna++) {
        // shrinkToFit: si el dueño le puso una abreviatura larga, el texto se
        // achica un poco en vez de salir cortado por la celda de al lado.
        agregada.getCell(columna).alignment = { vertical: "top", shrinkToFit: true };
      }
      agregada.getCell(columnaPesos).alignment = { vertical: "top" };
      if (!primero) {
        // El código se repite apagado: si el corte de página cae justo acá,
        // el renglón suelto igual se sabe de quién es.
        agregada.getCell(COL_CODIGO).font = { color: { argb: APAGADO } };
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
  const colCantidad = Math.min(columnaPesos - 1, PRIMER_PEDIDO + 2);
  const colUnidad = colCantidad + 1;
  const unirNombre = (fila: ExcelJS.Row) => {
    if (colCantidad > COL_CODIGO) {
      hoja.mergeCells(fila.number, COL_CODIGO, fila.number, colCantidad - 1);
    }
  };

  hoja.addRow([]);
  const tituloPreparar = hoja.addRow(["Para preparar"]);
  tituloPreparar.font = { bold: true };
  unirNombre(tituloPreparar);
  for (let columna = COL_CODIGO; columna <= colUnidad; columna++) {
    tituloPreparar.getCell(columna).border = { bottom: BORDE };
  }

  for (const linea of planilla.preparar) {
    const fila = hoja.addRow([]);
    // Entre paréntesis va cómo se llama corto arriba, así el que mira la hoja
    // impresa puede confirmar qué es cada abreviatura sin preguntarle a nadie.
    fila.getCell(COL_CODIGO).value =
      linea.corto === linea.nombre ? linea.nombre : `${linea.nombre} (${linea.corto})`;
    unirNombre(fila);
    fila.getCell(colCantidad).value = linea.cantidad;
    fila.getCell(colCantidad).numFmt = FORMATO_CANTIDAD;
    fila.getCell(colCantidad).alignment = { horizontal: "right" };
    fila.getCell(colUnidad).value = linea.unidad;
  }

  const totalPreparar = hoja.addRow([]);
  totalPreparar.getCell(COL_CODIGO).value = "Total";
  unirNombre(totalPreparar);
  totalPreparar.getCell(colCantidad).value = porUnidad;
  totalPreparar.getCell(colCantidad).alignment = { horizontal: "right" };
  if (colUnidad > colCantidad) {
    hoja.mergeCells(totalPreparar.number, colCantidad, totalPreparar.number, colUnidad);
  }
  totalPreparar.font = { bold: true };
  const ultimaFila = totalPreparar.number;

  // Con la cartera entera hay que scrollear: que los encabezados y las
  // columnas de la izquierda queden fijos es la diferencia entre poder leerla
  // y no. xSplit se cuenta desde COL_NOMBRE para que lo congelado sea siempre
  // hasta el nombre del comercio inclusive, aunque adelante haya más columnas.
  hoja.views = [{ state: "frozen", xSplit: COL_NOMBRE, ySplit: FILA_ENCABEZADOS }];

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
