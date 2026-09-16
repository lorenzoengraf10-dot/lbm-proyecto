import type { ParametrosPlanilla } from "@lbm/shared";

/**
 * Todo lo que puede venir en la URL de Pedidos.
 *
 * Las dos vistas comparten `desde`/`hasta` a propósito: es lo que hace que
 * elegir un tramo y cambiar de solapa muestre el mismo período. El resto son
 * de una sola vista y la otra los ignora.
 */
export interface ParametrosPedidos extends ParametrosPlanilla {
  /** "armar" para la hoja de armado; cualquier otra cosa, el listado. */
  ver?: string;
  vendedor?: string;
  mes?: string;
  estado?: string;
  impagos?: string;
}

export const VISTA_ARMAR = "armar";

export function esVistaDeArmado(parametros: ParametrosPedidos): boolean {
  return parametros.ver === VISTA_ARMAR;
}
