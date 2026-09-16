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

/**
 * Un `numeric` de Postgres, como número de verdad.
 *
 * PostgREST manda las columnas numeric como string ("−40.801234") para no
 * perder precisión, pero los tipos generados las declaran `number`: el
 * compilador no avisa nada y el error aparece recién al usarlas, con un
 * `.toFixed is not a function` o —peor— con una suma que concatena texto. Ya
 * pasó con pedidos.total, con comercios.lat y con el total del mapa.
 *
 * Por eso el parámetro acepta los dos: es lo que de verdad llega.
 */
export function numeroDeLaBase(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}
