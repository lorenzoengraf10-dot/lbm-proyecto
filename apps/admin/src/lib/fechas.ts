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

export interface Mes {
  /** "YYYY-MM", lo que viaja en la URL. */
  valor: string;
  /** Primer día del mes, YYYY-MM-DD. */
  desde: string;
  /** Último día del mes, YYYY-MM-DD. */
  hasta: string;
  /** "septiembre de 2026", para el desplegable. */
  etiqueta: string;
}

const formatoMes = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  month: "long",
  year: "numeric",
});

// El mes viaja en la URL, así que puede llegar cualquier cosa: un enlace
// viejo, un copiar y pegar cortado. Sin validar, un valor raro terminaba en
// "Invalid time value" y la pantalla entera se caía con un 500.
const FORMATO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function construirMes(valor: string): Mes {
  const [anio, mes] = valor.split("-").map(Number);
  const desde = `${valor}-01`;
  // Día 0 del mes siguiente = último día de este mes, sin tener que saber
  // si tiene 28, 30 o 31 días.
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const hasta = `${valor}-${String(ultimoDia).padStart(2, "0")}`;
  return { valor, desde, hasta, etiqueta: formatoMes.format(new Date(`${desde}T12:00:00Z`)) };
}

/** A partir de "YYYY-MM" arma el rango del mes. null si el valor no sirve. */
export function mesDesdeValor(valor: string): Mes | null {
  return FORMATO_MES.test(valor) ? construirMes(valor) : null;
}

/** Los últimos N meses (Argentina), del actual hacia atrás. */
export function ultimosMeses(cantidad: number): Mes[] {
  const [anioActual, mesActual] = diaArgentina().split("-").map(Number);
  return Array.from({ length: cantidad }, (_, i) => {
    const totalMeses = anioActual * 12 + (mesActual - 1) - i;
    const anio = Math.floor(totalMeses / 12);
    const mes = (totalMeses % 12) + 1;
    return construirMes(`${anio}-${String(mes).padStart(2, "0")}`);
  });
}
