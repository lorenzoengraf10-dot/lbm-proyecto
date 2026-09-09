// Vive fuera de actions.ts porque un módulo "use server" solo puede exportar
// funciones async.

export interface CredencialGenerada {
  usuario: string;
  clave: string;
}

export interface EstadoVendedor {
  error: string | null;
  ok: string | null;
  credencial: CredencialGenerada | null;
}

export const ESTADO_VENDEDOR_INICIAL: EstadoVendedor = {
  error: null,
  ok: null,
  credencial: null,
};
