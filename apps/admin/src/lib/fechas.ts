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

/**
 * Un tramo de días argentinos, con los días humanos y los instantes exactos
 * juntos. Mismo patrón que Semana en semana.ts: se valida una vez en el borde
 * y de ahí en adelante viaja armado, así la pantalla y la descarga no pueden
 * mirar tramos distintos.
 */
export interface RangoDias {
  /** Primer día, YYYY-MM-DD, inclusive. */
  desde: string;
  /** Último día, YYYY-MM-DD, inclusive. */
  hasta: string;
  /** Instante del "desde" a las 00:00 Argentina, en ISO. */
  desdeIso: string;
  /** Instante del día siguiente al "hasta" a las 00:00 Argentina (exclusivo). */
  hastaIso: string;
  /** Cuántos días abarca, contando los dos extremos. */
  dias: number;
  /** true si se pidió un tramo más largo que el máximo y hubo que recortarlo. */
  recortado: boolean;
}

/**
 * Un tramo tan largo se trae toda la historia con sus ítems anidados a
 * memoria y no sirve para armar pedidos: es un pedido mal escrito en la URL,
 * no algo que alguien quiera de verdad. Dos meses da para cerrar cualquier
 * cosa que haya quedado pendiente.
 */
export const MAXIMO_DIAS_PLANILLA = 62;

/**
 * El tramo entre dos días argentinos, desde inclusive y hasta exclusivo.
 *
 * Da vuelta los extremos si vienen al revés (comparar YYYY-MM-DD como texto
 * ya es comparar cronológicamente) y recorta si se pasa del máximo. Las dos
 * cosas acá adentro a propósito: si cada pantalla las hiciera por su cuenta,
 * alcanzaría con que una se olvidara para que el Excel y la pantalla dijeran
 * cosas distintas.
 */
export function rangoDeDias(desde: string, hasta: string): RangoDias {
  let primero = desde <= hasta ? desde : hasta;
  const ultimo = desde <= hasta ? hasta : desde;

  const dias = Math.round(
    (Date.parse(`${ultimo}T12:00:00Z`) - Date.parse(`${primero}T12:00:00Z`)) / 86_400_000 + 1
  );
  // Se recorta por el principio: el que pide un tramo enorme quiere lo último,
  // no lo de 2020.
  const recortado = dias > MAXIMO_DIAS_PLANILLA;
  if (recortado) primero = sumarDias(ultimo, -(MAXIMO_DIAS_PLANILLA - 1));

  const inicio = new Date(`${primero}T00:00:00${OFFSET_ARGENTINA}`);
  return {
    desde: primero,
    hasta: ultimo,
    desdeIso: inicio.toISOString(),
    // El día siguiente al último a las 00:00, exclusivo. Con
    // `${hasta}T23:59:59` —que es lo que se repite en otras pantallas— los
    // pedidos de entre las 21 y las 24 se caen por el offset.
    hastaIso: new Date(`${sumarDias(ultimo, 1)}T00:00:00${OFFSET_ARGENTINA}`).toISOString(),
    dias: recortado ? MAXIMO_DIAS_PLANILLA : dias,
    recortado,
  };
}

/** Los dos instantes que delimitan un día argentino: desde inclusive, hasta exclusivo. */
export function rangoDelDia(dia: string): RangoDias {
  return rangoDeDias(dia, dia);
}

/**
 * El rango que piden dos parámetros de la URL, con todo lo que puede venir
 * mal ya resuelto: basura cae al día por defecto, al revés se da vuelta y de
 * más se recorta.
 *
 * Con un solo extremo los dos casos no son simétricos, y es a propósito.
 * "Desde el 1" sin final se lee como "del 1 hasta hoy", así que el final lo
 * completa el día por defecto. "Hasta el 1" sin principio no dice desde
 * cuándo, y suponer toda la historia sería traerse dos meses sin que nadie
 * los haya pedido: queda ese día solo.
 *
 * La pantalla y la descarga tienen que llamar a esta misma función: con
 * cuatro parámetros sueltos, validar por duplicado es la puerta por la que
 * empiezan a mostrar tramos distintos.
 */
export function rangoDesdeParametros(
  desde: string | undefined | null,
  hasta: string | undefined | null,
  porDefecto: string
): RangoDias {
  const primero = diaValido(desde);
  const ultimo = diaValido(hasta);
  if (primero && ultimo) return rangoDeDias(primero, ultimo);
  if (primero) return rangoDeDias(primero, porDefecto);
  return rangoDeDias(ultimo ?? porDefecto, ultimo ?? porDefecto);
}

// El día viaja en la URL (?dia=2026-09-13), así que puede llegar cualquier
// cosa: un enlace viejo, un pegado a medias. Sin validar, un valor raro
// termina en "Invalid time value" y tumba la pantalla entera con un 500.
const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** El día tal cual si sirve como YYYY-MM-DD, o null. */
export function diaValido(dia: string | undefined | null): string | null {
  if (!dia || !FORMATO_DIA.test(dia)) return null;
  return Number.isNaN(new Date(`${dia}T12:00:00Z`).getTime()) ? null : dia;
}

const formatoDiaLargo = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "domingo, 13 de septiembre de 2026" */
export function etiquetaDiaLargo(dia: string): string {
  return formatoDiaLargo.format(new Date(`${dia}T12:00:00Z`));
}

// Las tres piezas con las que se arma el título de un rango. A mano y no con
// formatRange(): lo que devuelve depende de los datos de ICU que traiga el
// Node que toque, y esto termina en una hoja impresa.
const partesDeDia = { timeZone: "America/Argentina/Buenos_Aires" } as const;
const formatoSoloDia = new Intl.DateTimeFormat("es-AR", { ...partesDeDia, day: "numeric" });
const formatoDiaMes = new Intl.DateTimeFormat("es-AR", {
  ...partesDeDia,
  day: "numeric",
  month: "long",
});
const formatoDiaMesAnio = new Intl.DateTimeFormat("es-AR", {
  ...partesDeDia,
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * El título del tramo: "10 al 15 de septiembre de 2026", "28 de agosto al 3
 * de septiembre de 2026", o el día largo de siempre si es uno solo.
 *
 * En el rango se cae el día de la semana: "del lunes 10 al martes 15" es
 * ruido en el encabezado de una hoja impresa.
 */
export function etiquetaRango(desde: string, hasta: string): string {
  if (desde === hasta) return etiquetaDiaLargo(desde);

  const inicio = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
  const mismoMes = mismoAnio && desde.slice(5, 7) === hasta.slice(5, 7);

  const principio = mismoMes
    ? formatoSoloDia.format(inicio)
    : mismoAnio
      ? formatoDiaMes.format(inicio)
      : formatoDiaMesAnio.format(inicio);
  return `${principio} al ${formatoDiaMesAnio.format(fin)}`;
}

/** Suma (o resta) días a un YYYY-MM-DD sin que el huso mueva la fecha. */
export function sumarDias(dia: string, dias: number): string {
  const fecha = new Date(`${dia}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
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
