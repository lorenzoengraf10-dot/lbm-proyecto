export type Rol = "admin" | "vendedor";

export interface Usuario {
  id: string;
  nombre: string;
  username: string;
  rol: Rol;
  comisionPct: number;
  activo: boolean;
  createdAt: string;
}

export interface Comercio {
  id: string;
  codigo: string;
  nombre: string;
  localidad: string;
  telefono: string | null;
  activo: boolean;
  createdAt: string;
}

export interface Producto {
  id: string;
  nombre: string;
  precio: number;
  unidadMedida: string;
  activo: boolean;
  createdAt: string;
}

export interface Visita {
  id: string;
  comercioId: string;
  vendedorId: string;
  fechaHora: string;
  createdAt: string;
}

export interface Pedido {
  id: string;
  visitaId: string;
  comercioId: string;
  vendedorId: string;
  fecha: string;
  total: number;
  createdAt: string;
}

export interface PedidoItem {
  id: string;
  pedidoId: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export type ConfiguracionClave =
  | "tasa_comision_default"
  | "pin_length"
  | "max_intentos_pin";

export interface ComercioImportRow {
  codigo: string;
  nombre: string;
  localidad: string;
  /**
   * null cuando la fila no trae teléfono, nunca ausente: PostgREST arma el
   * insert con las columnas del PRIMER objeto del lote, así que si a esa fila
   * le faltaba la clave, los teléfonos de todas las demás se perdían en
   * silencio.
   */
  telefono: string | null;
}
