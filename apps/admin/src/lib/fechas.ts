// Días en huso Argentina, igual que privado.es_hoy_ar() en la base: el
// servidor corre en UTC, así que contar días sin fijar el huso movería el
// corte tres horas y una visita de las 22:00 contaría como del día siguiente.
const formatoDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function diaArgentina(fecha: Date = new Date()): string {
  return formatoDia.format(fecha);
}

/** Días calendario (Argentina) desde la fecha dada hasta hoy. */
export function diasDesde(iso: string): number {
  const aMedianoche = (fecha: Date) => Date.parse(`${diaArgentina(fecha)}T00:00:00Z`);
  return Math.round((aMedianoche(new Date()) - aMedianoche(new Date(iso))) / 86_400_000);
}

// Argentina no usa horario de verano desde 2009, así que el offset es fijo.
// Si algún día vuelve, este es el único lugar a tocar.
export const OFFSET_ARGENTINA = "-03:00";

/** Los dos instantes que delimitan un día argentino: desde inclusive, hasta exclusivo. */
export function rangoDelDia(dia: string): { desdeIso: string; hastaIso: string } {
  const desde = new Date(`${dia}T00:00:00${OFFSET_ARGENTINA}`);
  return {
    desdeIso: desde.toISOString(),
    hastaIso: new Date(desde.getTime() + 86_400_000).toISOString(),
  };
}
