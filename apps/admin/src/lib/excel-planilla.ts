import "server-only";

import ExcelJS from "exceljs";
import { etiquetaDiaLargo } from "./fechas";
import type { PlanillaDia } from "./planilla-dia";

const FILA_ENCABEZADOS = 4;

// Los kilos con hasta dos decimales y sin ceros de relleno: "5" y "5,5", no
// "5,00". El de pesos sí lleva los dos, que es como se lee la plata.
const FORMATO_CANTIDAD = "#,##0.##";
const FORMATO_PESOS = '"$"#,##0.00';

const GRIS = "FFF5F5F4";
const BORDE = { style: "thin" as const, color: { argb: "FFD6D3D1" } };

// A partir de acá los encabezados se escriben de costado. Con pocos productos
// se leen mejor derechos; con muchos, la hoja no entra en un A4 de otra forma.
const DESDE_CUANTOS_SE_GIRA = 6;

/**
 * La planilla del día en Excel, pensada para imprimir en A4: una fila por
 * comercio, una columna por producto con la cantidad, y los totales abajo.
 * Sale de los mismos números que la pantalla (armarPlanillaDia), así que no
 * pueden discrepar.
 */
export async function excelPlanillaDia(planilla: PlanillaDia): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "La Buena Medida";
  libro.created = new Date();

  // El nombre de la hoja no admite / \ ? * [ ] y se corta a 31 caracteres.
  const hoja = libro.addWorksheet(`Pedidos ${planilla.dia.replaceAll("-", "")}`);

  const girados = planilla.productos.length >= DESDE_CUANTOS_SE_GIRA;
  const primerProducto = 3;
  const primerTotal = primerProducto + planilla.productos.length;
  const columnaPesos = primerTotal + planilla.unidades.length;

  hoja.columns = [
    { key: "codigo", width: 8 },
    { key: "nombre", width: 26 },
    ...planilla.productos.map((producto) => ({
      key: `p_${producto.id}`,
      // Girado, el largo del título ya no estira la columna: alcanza con que
      // entre el número. Derecho, la columna la manda el encabezado.
      width: girados ? 5.5 : Math.max(9, producto.corto.length + 4),
    })),
    ...planilla.unidades.map((unidad) => ({ key: `t_${unidad.clave}`, width: 8 })),
    { key: "pesos", width: 12 },
  ];

  const titulo = hoja.getCell("A1");
  titulo.value = `Pedidos del ${etiquetaDiaLargo(planilla.dia)}`;
  titulo.font = { bold: true, size: 14 };

  const porUnidad = planilla.unidades
    .map((unidad) => `${formatearNumero(planilla.totales[unidad.clave] ?? 0)} ${unidad.corta}`)
    .join(" · ");
  const resumen = hoja.getCell("A2");
  resumen.value =
    `${planilla.cuantosPidieron} de ${planilla.filas.length} comercios pidieron` +
    (porUnidad ? ` · ${porUnidad}` : "");
  resumen.font = { size: 10, color: { argb: "FF78716C" } };

  const encabezados = [
    "Código",
    "Comercio",
    // El nombre corto y la unidad: así la celda queda con el número pelado y
    // se puede sumar en Excel sin tocar nada.
    ...planilla.productos.map((producto) => `${producto.corto} (${producto.unidad})`),
    ...planilla.unidades.map((unidad) => `Total ${unidad.corta}`),
    "Total $",
  ];
  // Se giran los productos y también los totales por unidad: "Total doc." no
  // entra derecho en una columna angosta y se partía en dos renglones.
  const seGira = (columna: number) => girados && columna >= primerProducto && columna < columnaPesos;

  const filaEncabezados = hoja.getRow(FILA_ENCABEZADOS);
  filaEncabezados.values = encabezados;
  filaEncabezados.font = { bold: true };
  // El alto lo manda el título más largo de los que van de costado: con un
  // alto fijo, "Queso cremoso (kg)" salía cortado en la hoja impresa.
  const masLargo = encabezados
    .filter((_, indice) => seGira(indice + 1))
    .reduce((largo, texto) => Math.max(largo, texto.length), 0);
  filaEncabezados.height = girados ? Math.min(170, masLargo * 6.8 + 14) : 30;
  filaEncabezados.eachCell((celda, columna) => {
    celda.alignment = seGira(columna)
      ? { textRotation: 90, vertical: "bottom", horizontal: "center" }
      : { vertical: "middle", horizontal: "left", wrapText: true };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    celda.border = { bottom: BORDE };
  });

  for (const fila of planilla.filas) {
    const agregada = hoja.addRow({
      codigo: fila.codigo,
      nombre: fila.activo ? fila.nombre : `${fila.nombre} (dado de baja)`,
      ...Object.fromEntries(
        planilla.productos.map((producto) => [
          `p_${producto.id}`,
          // Celda vacía, no cero: un cero se lee como "pidió cero" y encima
          // ensucia la planilla cuando la mayoría no pidió nada ese día.
          fila.cantidades[producto.id] ?? null,
        ])
      ),
      ...Object.fromEntries(
        planilla.unidades.map((unidad) => [`t_${unidad.clave}`, fila.totales[unidad.clave] ?? null])
      ),
      pesos: fila.pidio ? fila.totalPesos : null,
    });
    formatearNumeros(agregada, primerProducto, columnaPesos);
  }

  const totales = hoja.addRow({
    codigo: "",
    nombre: "Total del día",
    ...Object.fromEntries(
      planilla.productos.map((producto) => [`p_${producto.id}`, planilla.porProducto[producto.id]])
    ),
    ...Object.fromEntries(
      planilla.unidades.map((unidad) => [`t_${unidad.clave}`, planilla.totales[unidad.clave]])
    ),
    pesos: planilla.totalPesos,
  });
  formatearNumeros(totales, primerProducto, columnaPesos);
  totales.font = { bold: true };
  totales.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    celda.border = { top: BORDE };
  });

  // Los nombres que se acortaron, aclarados abajo: "Salame fino" se entiende,
  // pero el que mira la hoja impresa tiene que poder confirmarlo.
  const acortados = planilla.productos.filter((producto) => producto.corto !== producto.nombre);
  let ultimaFila = totales.number;
  if (acortados.length > 0) {
    hoja.addRow([]);
    const texto = acortados
      .map((producto) => `${producto.corto} = ${producto.nombre}`)
      .join("   ·   ");
    const referencias = hoja.addRow([texto]);
    ultimaFila = referencias.number;
    // Unida de punta a punta y con el texto plegado: si se la deja suelta, se
    // derrama sobre las columnas de la derecha y al imprimir arrastra el área
    // de impresión, que es lo que hacía salir toda la planilla diminuta.
    hoja.mergeCells(referencias.number, 1, referencias.number, encabezados.length);
    const celda = referencias.getCell(1);
    celda.font = { size: 9, color: { argb: "FF78716C" } };
    celda.alignment = { wrapText: true, vertical: "top" };
    // Una línea entra en unos 130 caracteres a lo ancho de la hoja.
    referencias.height = 13 * Math.ceil(texto.length / 130) + 4;
  }

  // Con la cartera entera hay que scrollear: que los encabezados y el código
  // queden fijos es la diferencia entre poder leerla y no.
  hoja.views = [{ state: "frozen", xSplit: 2, ySplit: FILA_ENCABEZADOS }];
  if (planilla.filas.length > 0) {
    hoja.autoFilter = {
      from: { row: FILA_ENCABEZADOS, column: 1 },
      to: { row: FILA_ENCABEZADOS + planilla.filas.length, column: encabezados.length },
    };
  }

  // Para imprimir: A4 apaisado, todo el ancho en una sola hoja y tantas hojas
  // de alto como haga falta. Los encabezados se repiten arriba de cada página,
  // que si no la segunda hoja son números sueltos sin saber de qué producto.
  const ultimaColumna = hoja.getColumn(encabezados.length).letter;
  hoja.pageSetup = {
    printArea: `A1:${ultimaColumna}${ultimaFila}`,
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

/** Las columnas de cantidades y totales, con su formato numérico. */
function formatearNumeros(fila: ExcelJS.Row, primerProducto: number, columnaPesos: number) {
  for (let columna = primerProducto; columna < columnaPesos; columna++) {
    const celda = fila.getCell(columna);
    celda.numFmt = FORMATO_CANTIDAD;
    celda.alignment = { horizontal: "right" };
  }
  fila.getCell(columnaPesos).numFmt = FORMATO_PESOS;
}

const formatoNumero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
function formatearNumero(valor: number): string {
  return formatoNumero.format(valor);
}
