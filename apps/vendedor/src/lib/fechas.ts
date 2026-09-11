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
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const hasta = `${valor}-${String(ultimoDia).padStart(2, "0")}`;
  return { valor, desde, hasta, etiqueta: formatoMes.format(new Date(`${desde}T12:00:00Z`)) };
}

/** A partir de "YYYY-MM" arma el rango del mes. null si el valor no sirve. */
export function mesDesdeValor(valor: string): Mes | null {
  return FORMATO_MES.test(valor) ? construirMes(valor) : null;
}

/** El mes en curso (Argentina). */
export function mesActual(): Mes {
  const [anio, mes] = diaArgentina().split("-");
  return construirMes(`${anio}-${mes}`);
}

/** Los últimos N meses (Argentina), del actual hacia atrás. */
export function ultimosMeses(cantidad: number): Mes[] {
  const [anioBase, mesBase] = diaArgentina().split("-").map(Number);
  return Array.from({ length: cantidad }, (_, i) => {
    const totalMeses = anioBase * 12 + (mesBase - 1) - i;
    const anio = Math.floor(totalMeses / 12);
    const mes = (totalMeses % 12) + 1;
    return construirMes(`${anio}-${String(mes).padStart(2, "0")}`);
  });
}
