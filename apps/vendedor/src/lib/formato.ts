const formatoPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

// Las columnas numeric de Postgres llegan como string ("6400.00") para no
// perder precisión, y los tipos generados igual las declaran como number.
// Aceptar los dos y convertir acá evita tener que acordarse en cada pantalla.
export function formatearPrecio(valor: number | string): string {
  return formatoPrecio.format(Number(valor));
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
