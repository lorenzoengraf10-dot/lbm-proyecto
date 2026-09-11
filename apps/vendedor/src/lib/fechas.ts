// "Mismo día" según el huso de Argentina, igual que privado.es_hoy_ar() en la
// base: el servidor corre en UTC, así que comparar fechas sin fijar el huso
// haría que un pedido de las 22:00 ya contara como "de ayer".
const formatoDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function diaArgentina(fecha: Date = new Date()): string {
  return formatoDia.format(fecha);
}

export function esDeHoy(iso: string): boolean {
  return diaArgentina(new Date(iso)) === diaArgentina();
}
