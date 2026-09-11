import { diaArgentina } from "./fechas";

// La semana del negocio es lunes a domingo en huso Argentina (docs/PLAN.md,
// punto 6 de las ambigüedades). Argentina no usa horario de verano desde
// 2009, así que el offset -03:00 es fijo; si algún día vuelve, este archivo
// es el único lugar a tocar.
const OFFSET_ARGENTINA = "-03:00";

export interface Semana {
  /** Lunes, en formato YYYY-MM-DD. */
  lunes: string;
  /** Domingo, en formato YYYY-MM-DD. */
  domingo: string;
  /** Instante exacto del lunes 00:00 Argentina, en ISO. */
  desdeIso: string;
  /** Instante exacto del lunes siguiente 00:00 Argentina, en ISO (exclusivo). */
  hastaIso: string;
}

function sumarDias(dia: string, dias: number): string {
  const fecha = new Date(`${dia}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/** Lunes de la semana a la que pertenece el día dado (YYYY-MM-DD). */
export function lunesDe(dia: string): string {
  // getUTCDay sobre el mediodía UTC evita que el corrimiento de huso mueva
  // el día. 0 = domingo, por eso el domingo retrocede 6.
  const diaSemana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return sumarDias(dia, diaSemana === 0 ? -6 : 1 - diaSemana);
}

export function semanaDesdeLunes(lunes: string): Semana {
  return {
    lunes,
    domingo: sumarDias(lunes, 6),
    desdeIso: new Date(`${lunes}T00:00:00${OFFSET_ARGENTINA}`).toISOString(),
    hastaIso: new Date(`${sumarDias(lunes, 7)}T00:00:00${OFFSET_ARGENTINA}`).toISOString(),
  };
}

export function semanaActual(): Semana {
  return semanaDesdeLunes(lunesDe(diaArgentina()));
}

/** Las últimas N semanas, de la más reciente a la más vieja. */
export function ultimasSemanas(cantidad: number): Semana[] {
  const actual = semanaActual();
  return Array.from({ length: cantidad }, (_, i) => semanaDesdeLunes(sumarDias(actual.lunes, -7 * i)));
}

const formatoDiaCorto = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
});

export function etiquetaSemana(semana: Semana): string {
  const inicio = formatoDiaCorto.format(new Date(`${semana.lunes}T12:00:00Z`));
  const fin = formatoDiaCorto.format(new Date(`${semana.domingo}T12:00:00Z`));
  return `${inicio} al ${fin}`;
}
