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

const formatoComision = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** 3.00 -> "3%", 2.50 -> "2,5%" */
export function formatearComision(valor: number | string | null): string {
  if (valor === null) return "—";
  return `${formatoComision.format(Number(valor))}%`;
}

const formatoFechaHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatearFechaHora(iso: string): string {
  return formatoFechaHora.format(new Date(iso));
}

const formatoCantidad = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

// numeric(10,2) vuelve de la base como string ("2.00") para no perder
// precisión: sin este formateo se leería "2.00 kg" en vez de "2 kg".
export function formatearCantidad(valor: number | string): string {
  return formatoCantidad.format(Number(valor));
}
