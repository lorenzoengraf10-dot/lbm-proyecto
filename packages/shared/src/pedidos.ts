import type { Database } from "./database.types";

export type EstadoPedido = Database["public"]["Enums"]["estado_pedido"];
export type FormaPago = Database["public"]["Enums"]["forma_pago"];

/**
 * El pedido avanza siempre para adelante: se toma en el comercio, se prepara
 * en el local y se completa al entregarlo. El orden importa —la app muestra
 * "el que sigue" en vez de pedirle al usuario que elija de una lista.
 */
export const ESTADOS: EstadoPedido[] = ["pedido", "preparado", "completado"];

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  pedido: "Pedido",
  preparado: "Preparado",
  completado: "Completado",
};

/** Qué significa cada estado, para que nadie tenga que adivinar. */
export const DETALLE_ESTADO: Record<EstadoPedido, string> = {
  pedido: "Tomado en el comercio, todavía sin preparar.",
  preparado: "Armado en el local, listo para salir.",
  completado: "Entregado en el comercio.",
};

export const ETIQUETA_PAGO: Record<FormaPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cuenta_corriente: "Queda debiendo",
};

export const FORMAS_PAGO: FormaPago[] = ["efectivo", "transferencia", "cuenta_corriente"];

/** El estado que sigue, o null si ya está completado. */
export function estadoSiguiente(estado: EstadoPedido): EstadoPedido | null {
  return ESTADOS[ESTADOS.indexOf(estado) + 1] ?? null;
}

/** El estado anterior, para deshacer una marca puesta por error. */
export function estadoAnterior(estado: EstadoPedido): EstadoPedido | null {
  const indice = ESTADOS.indexOf(estado);
  return indice > 0 ? ESTADOS[indice - 1] : null;
}

export function esEstado(valor: string | undefined): valor is EstadoPedido {
  return valor !== undefined && (ESTADOS as string[]).includes(valor);
}

export function esFormaPago(valor: string | undefined): valor is FormaPago {
  return valor !== undefined && (FORMAS_PAGO as string[]).includes(valor);
}

/**
 * Lo que se le muestra al usuario sobre el cobro de un pedido. Un pedido
 * anterior a que existieran las formas de pago queda sin registrar, y decirlo
 * es más honesto que inventar un "efectivo" que nadie confirmó.
 */
export function textoCobro(
  estado: EstadoPedido,
  formaPago: FormaPago | null,
  cobradoEn: string | null
): string {
  if (estado !== "completado") return "—";
  if (!formaPago) return "Sin registrar";
  if (formaPago === "cuenta_corriente") {
    return cobradoEn ? "Queda debiendo · cobrado" : "Queda debiendo";
  }
  return ETIQUETA_PAGO[formaPago];
}

/** Un pedido entregado que todavía no se cobró. */
export function estaImpago(formaPago: FormaPago | null, cobradoEn: string | null): boolean {
  return formaPago === "cuenta_corriente" && !cobradoEn;
}
