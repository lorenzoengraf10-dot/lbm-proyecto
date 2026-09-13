import "server-only";

import ExcelJS from "exceljs";
import { etiquetaDiaLargo } from "./fechas";
import type { PlanillaDia } from "./planilla-dia";

const FILA_ENCABEZADOS = 4;

// Los kilos con hasta dos decimales y sin ceros de relleno: "5" y "5,5", no
// "5,00". El de pesos sí lleva los dos, que es como se lee la plata.
const FORMATO_KG = "#,##0.##";
const FORMATO_PESOS = '"$"#,##0.00';

const GRIS = "FFF5F5F4";

/**
 * La planilla del día en Excel: una fila por comercio, una columna por producto
 * con el kilaje, y los totales abajo. Sale de los mismos números que la
 * pantalla (armarPlanillaDia), así que no pueden discrepar.
 */
export async function excelPlanillaDia(planilla: PlanillaDia): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "La Buena Medida";
  libro.created = new Date();

  // El nombre de la hoja no admite / \ ? * [ ] y se corta a 31 caracteres.
  const hoja = libro.addWorksheet(`Pedidos ${planilla.dia.replaceAll("-", "")}`);

  hoja.columns = [
    { key: "codigo", width: 10 },
    { key: "nombre", width: 32 },
    ...planilla.productos.map((producto) => ({
      key: `p_${producto.id}`,
      width: Math.max(12, Math.min(20, producto.nombre.length + 4)),
    })),
    { key: "totalKg", width: 11 },
    { key: "totalPesos", width: 14 },
  ];

  const titulo = hoja.getCell("A1");
  titulo.value = `Pedidos del ${etiquetaDiaLargo(planilla.dia)}`;
  titulo.font = { bold: true, size: 14 };

  const resumen = hoja.getCell("A2");
  resumen.value =
    `${planilla.cuantosPidieron} de ${planilla.filas.length} comercios pidieron` +
    ` · ${formatearNumero(planilla.totalKg)} kg en total`;
  resumen.font = { size: 10, color: { argb: "FF78716C" } };

  const encabezados = [
    "Código",
    "Comercio",
    // La unidad va en el título de la columna: así la celda queda con el
    // número pelado y se puede sumar en Excel sin tocar nada.
    ...planilla.productos.map((producto) => `${producto.nombre} (${producto.unidad})`),
    "Total kg",
    "Total $",
  ];
  const filaEncabezados = hoja.getRow(FILA_ENCABEZADOS);
  filaEncabezados.values = encabezados;
  filaEncabezados.font = { bold: true };
  filaEncabezados.alignment = { vertical: "middle", wrapText: true };
  filaEncabezados.height = 28;
  filaEncabezados.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    celda.border = { bottom: { style: "thin", color: { argb: "FFD6D3D1" } } };
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
      totalKg: fila.pidio ? fila.totalKg : null,
      totalPesos: fila.pidio ? fila.totalPesos : null,
    });
    formatearNumeros(agregada, planilla.productos.length);
  }

  const totales = hoja.addRow({
    codigo: "",
    nombre: "Total del día",
    ...Object.fromEntries(
      planilla.productos.map((producto) => [`p_${producto.id}`, planilla.porProducto[producto.id]])
    ),
    totalKg: planilla.totalKg,
    totalPesos: planilla.totalPesos,
  });
  formatearNumeros(totales, planilla.productos.length);
  totales.font = { bold: true };
  totales.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    celda.border = { top: { style: "thin", color: { argb: "FFD6D3D1" } } };
  });

  // Con la cartera entera hay que scrollear: que los encabezados y el código
  // queden fijos es la diferencia entre poder leerla y no.
  hoja.views = [{ state: "frozen", xSplit: 2, ySplit: FILA_ENCABEZADOS }];
  if (planilla.filas.length > 0) {
    hoja.autoFilter = {
      from: { row: FILA_ENCABEZADOS, column: 1 },
      to: { row: FILA_ENCABEZADOS + planilla.filas.length, column: encabezados.length },
    };
  }

  // ExcelJS devuelve un Buffer de Node; Response lo acepta igual.
  return libro.xlsx.writeBuffer();
}

/** Las columnas de kilos y la de pesos, con su formato numérico. */
function formatearNumeros(fila: ExcelJS.Row, cuantosProductos: number) {
  // Código y Comercio, después los productos.
  const primerProducto = 3;
  for (let i = 0; i < cuantosProductos; i++) {
    const celda = fila.getCell(primerProducto + i);
    celda.numFmt = FORMATO_KG;
    celda.alignment = { horizontal: "right" };
  }
  fila.getCell(primerProducto + cuantosProductos).numFmt = FORMATO_KG;
  fila.getCell(primerProducto + cuantosProductos + 1).numFmt = FORMATO_PESOS;
}

const formatoNumero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
function formatearNumero(valor: number): string {
  return formatoNumero.format(valor);
}
