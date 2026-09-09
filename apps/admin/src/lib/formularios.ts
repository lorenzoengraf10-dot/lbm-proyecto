import type { PostgrestError } from "@supabase/supabase-js";

export interface EstadoFormulario {
  error: string | null;
  ok: string | null;
  /** Cambia en cada alta exitosa para poder vaciar el formulario sin depender
   * de que el texto del mensaje sea distinto al de la vez anterior. */
  nonce: number;
}

export const ESTADO_INICIAL: EstadoFormulario = { error: null, ok: null, nonce: 0 };

export function exito(mensaje: string): EstadoFormulario {
  return { error: null, ok: mensaje, nonce: Date.now() };
}

export function fallo(mensaje: string): EstadoFormulario {
  return { error: mensaje, ok: null, nonce: 0 };
}

/** Traduce los errores de Postgres/PostgREST a algo que le sirva a quien usa el panel. */
export function mensajeDeError(error: PostgrestError, duplicado: string): string {
  switch (error.code) {
    case "23505":
      return duplicado;
    case "23514":
      return "Alguno de los datos no cumple una validación de la base.";
    case "42501":
      return "Tu usuario no tiene permisos para hacer este cambio.";
    default:
      return `No se pudo guardar: ${error.message}`;
  }
}
