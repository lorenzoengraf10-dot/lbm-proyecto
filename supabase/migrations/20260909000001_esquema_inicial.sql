-- Etapa 1: modelo de datos básico (usuarios, comercios, productos, visitas, pedidos)

create extension if not exists pgcrypto;

create type public.rol_usuario as enum ('admin', 'vendedor');

-- Perfil de negocio de cada usuario, 1:1 con auth.users.
-- comision_pct se completa solo desde configuracion.tasa_comision_default (ver trigger)
-- si no se especifica, para poder variar la comisión por persona a futuro sin migrar nada.
create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  username text not null,
  rol public.rol_usuario not null,
  comision_pct numeric(5, 2),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Único case-insensitive: evita altas duplicadas tipo "Juan" / "juan".
create unique index idx_usuarios_username_lower on public.usuarios (lower(username));

-- Cartera de comercios clientes.
-- codigo se guarda siempre en mayúsculas (constraint), tanto para respetar
-- la convención ya usada por el negocio (CP1, V13) como para que el import
-- por CSV pueda hacer upsert por codigo sin crear duplicados por mayúsc/minúsc.
create table public.comercios (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo = upper(codigo)),
  nombre text not null,
  localidad text not null,
  telefono text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_comercios_activo on public.comercios (activo);

-- Catálogo de productos (chico, sin categorías).
create table public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio numeric(10, 2) not null check (precio >= 0),
  unidad_medida text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_productos_activo on public.productos (activo);

-- Configuración editable por el admin: tasa de comisión, largo de PIN, etc.
create table public.configuracion (
  clave text primary key,
  valor text not null,
  descripcion text
);

-- Se registra SIEMPRE que un vendedor escanea el QR de un comercio,
-- tenga pedido asociado o no.
create table public.visitas (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios (id),
  vendedor_id uuid not null references public.usuarios (id),
  fecha_hora timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_visitas_comercio on public.visitas (comercio_id);
create index idx_visitas_vendedor_fecha on public.visitas (vendedor_id, fecha_hora);

-- Pedido opcional asociado 1 a 1 a una visita.
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null unique references public.visitas (id),
  comercio_id uuid not null references public.comercios (id),
  vendedor_id uuid not null references public.usuarios (id),
  fecha timestamptz not null default now(),
  total numeric(10, 2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now()
);

create index idx_pedidos_vendedor_fecha on public.pedidos (vendedor_id, fecha);
create index idx_pedidos_comercio on public.pedidos (comercio_id);

-- Ítems del pedido, con precio congelado al momento de la venta
-- (no referencia el precio actual del catálogo, para no distorsionar reportes históricos).
create table public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  producto_id uuid not null references public.productos (id),
  cantidad numeric(10, 2) not null check (cantidad > 0),
  precio_unitario numeric(10, 2) not null check (precio_unitario >= 0),
  subtotal numeric(10, 2) generated always as (cantidad * precio_unitario) stored
);

create index idx_pedido_items_pedido on public.pedido_items (pedido_id);
