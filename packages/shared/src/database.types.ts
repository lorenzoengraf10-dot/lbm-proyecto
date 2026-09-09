// Tipos del esquema de la base, espejo de supabase/migrations/.
//
// Normalmente esto lo genera `supabase gen types typescript`, pero ese comando
// necesita Docker. Está escrito a mano y verificado contra el esquema real por
// scripts/verificar-tipos-db.ts, que compara columna por columna contra la base.
// Cuando haya un proyecto Supabase linkeado, conviene regenerarlo con:
//   pnpm dlx supabase gen types typescript --linked > packages/shared/src/database.types.ts

export type Database = {
  public: {
    Tables: {
      usuarios: {
        Row: {
          id: string;
          nombre: string;
          username: string;
          rol: Database["public"]["Enums"]["rol_usuario"];
          comision_pct: number | null;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          nombre: string;
          username: string;
          rol: Database["public"]["Enums"]["rol_usuario"];
          comision_pct?: number | null;
          activo?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          username?: string;
          rol?: Database["public"]["Enums"]["rol_usuario"];
          comision_pct?: number | null;
          activo?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      comercios: {
        Row: {
          id: string;
          codigo: string;
          nombre: string;
          localidad: string;
          telefono: string | null;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          codigo: string;
          nombre: string;
          localidad: string;
          telefono?: string | null;
          activo?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          codigo?: string;
          nombre?: string;
          localidad?: string;
          telefono?: string | null;
          activo?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      productos: {
        Row: {
          id: string;
          nombre: string;
          precio: number;
          unidad_medida: string;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          precio: number;
          unidad_medida: string;
          activo?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          precio?: number;
          unidad_medida?: string;
          activo?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      configuracion: {
        Row: {
          clave: string;
          valor: string;
          descripcion: string | null;
        };
        Insert: {
          clave: string;
          valor: string;
          descripcion?: string | null;
        };
        Update: {
          clave?: string;
          valor?: string;
          descripcion?: string | null;
        };
        Relationships: [];
      };
      visitas: {
        Row: {
          id: string;
          comercio_id: string;
          vendedor_id: string;
          fecha_hora: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          comercio_id: string;
          vendedor_id: string;
          fecha_hora?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          comercio_id?: string;
          vendedor_id?: string;
          fecha_hora?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visitas_comercio_id_fkey";
            columns: ["comercio_id"];
            isOneToOne: false;
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visitas_vendedor_id_fkey";
            columns: ["vendedor_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      pedidos: {
        Row: {
          id: string;
          visita_id: string;
          comercio_id: string;
          vendedor_id: string;
          fecha: string;
          total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          visita_id: string;
          comercio_id: string;
          vendedor_id: string;
          fecha?: string;
          total?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          visita_id?: string;
          comercio_id?: string;
          vendedor_id?: string;
          fecha?: string;
          total?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pedidos_visita_id_fkey";
            columns: ["visita_id"];
            isOneToOne: true;
            referencedRelation: "visitas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedidos_comercio_id_fkey";
            columns: ["comercio_id"];
            isOneToOne: false;
            referencedRelation: "comercios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedidos_vendedor_id_fkey";
            columns: ["vendedor_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      pedido_items: {
        Row: {
          id: string;
          pedido_id: string;
          producto_id: string;
          cantidad: number;
          precio_unitario: number;
          subtotal: number;
        };
        Insert: {
          id?: string;
          pedido_id: string;
          producto_id: string;
          cantidad: number;
          precio_unitario: number;
        };
        Update: {
          id?: string;
          pedido_id?: string;
          producto_id?: string;
          cantidad?: number;
          precio_unitario?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pedido_items_pedido_id_fkey";
            columns: ["pedido_id"];
            isOneToOne: false;
            referencedRelation: "pedidos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      rol_actual: {
        Args: Record<string, never>;
        Returns: Database["public"]["Enums"]["rol_usuario"];
      };
      es_hoy_ar: {
        Args: { momento: string };
        Returns: boolean;
      };
    };
    Enums: {
      rol_usuario: "admin" | "vendedor";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tabla<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
