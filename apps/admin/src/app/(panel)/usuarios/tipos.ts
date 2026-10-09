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
  /**
   * El repartidor recién creado, para mandar al admin a cargarle el PIN: su
   * app entra solo con nombre y PIN, así que una contraseña no le sirve y
   * hasta que tenga PIN no puede entrar.
   */
  repartidorNuevo?: { id: string; nombre: string } | null;
}

export const ESTADO_VENDEDOR_INICIAL: EstadoVendedor = {
  error: null,
  ok: null,
  credencial: null,
};
