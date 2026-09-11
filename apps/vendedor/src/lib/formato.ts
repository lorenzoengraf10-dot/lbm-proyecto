const formatoPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

export function formatearPrecio(valor: number): string {
  return formatoPrecio.format(valor);
}

const formatoCantidad = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

// pedido_items.cantidad es numeric(10,2): vuelve de la base como "2.00" (string,
// para no perder precisión) aunque el vendedor haya tipeado "2". Sin este
// formateo, el resumen del último pedido se leería como "2.00 kg" en vez de
// "2 kg" — y si de verdad cargó una fracción, "1.5" sigue mostrando "1,5".
export function formatearCantidad(valor: number | string): string {
  return formatoCantidad.format(Number(valor));
}

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatearFechaHora(iso: string): string {
  return formatoFecha.format(new Date(iso));
}
