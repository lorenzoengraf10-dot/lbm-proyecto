-- ============================================================
-- La Buena Medida — esquema completo de la base
--
-- Pegar TODO este archivo en el SQL Editor de Supabase y ejecutar.
-- Es el mismo contenido de supabase/migrations/, junto en un solo
-- archivo para poder aplicarlo sin usar la terminal.
--
-- Se corre UNA sola vez, sobre un proyecto nuevo y vacío.
-- ============================================================


-- ------------------------------------------------------------
-- 20260909000001_esquema_inicial.sql
-- ------------------------------------------------------------

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
  comision_pct numeric(5, 2) not null,
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

-- Único case-insensitive: el catálogo tiene 15-20 ítems y dos productos con el
-- mismo nombre serían un error de carga, no algo buscado (y el vendedor no
-- podría distinguirlos en la app).
create unique index idx_productos_nombre_lower on public.productos (lower(nombre));
create index idx_productos_activo on public.productos (activo);

-- Configuración editable por el admin: tasa de comisión, largo de PIN, etc.
-- Los valores se cargan acá y no en seed.sql porque la app los necesita para
-- funcionar (seed.sql es solo datos de ejemplo para desarrollo).
create table public.configuracion (
  clave text primary key,
  valor text not null,
  descripcion text
);

insert into public.configuracion (clave, valor, descripcion) values
  ('tasa_comision_default', '3', 'Porcentaje de comisión por defecto para vendedores nuevos'),
  ('pin_length', '4', 'Cantidad de dígitos del PIN de desbloqueo del vendedor'),
  ('max_intentos_pin', '5', 'Intentos fallidos de PIN antes de exigir login completo de nuevo');

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
  subtotal numeric(10, 2) not null generated always as (cantidad * precio_unitario) stored
);

create index idx_pedido_items_pedido on public.pedido_items (pedido_id);


-- ------------------------------------------------------------
-- 20260909000002_funciones_y_triggers.sql
-- ------------------------------------------------------------

-- Devuelve el rol del usuario autenticado actual, o null si no tiene perfil o
-- está dado de baja. Que devuelva null para los inactivos es lo que hace que
-- un vendedor dado de baja pierda el acceso en todas las policies de una.
--
-- security definer + search_path fijo: puede leer public.usuarios como dueño de
-- la tabla (bypass de RLS) sin volver a evaluar la policy de usuarios, evitando
-- recursión infinita cuando otras policies llaman a esta función.
create or replace function public.rol_actual()
returns public.rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.usuarios where id = auth.uid() and activo;
$$;

-- Completa comision_pct desde configuracion.tasa_comision_default si no
-- se especificó uno propio al dar de alta al vendedor.
create or replace function public.set_comision_pct_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.comision_pct is null then
    select valor::numeric into new.comision_pct
    from public.configuracion
    where clave = 'tasa_comision_default';

    if new.comision_pct is null then
      raise exception 'Falta la fila tasa_comision_default en public.configuracion';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_set_comision_pct_default
  before insert on public.usuarios
  for each row
  execute function public.set_comision_pct_default();

-- "Mismo día" para la ventana de edición de pedidos, en huso horario
-- Argentina (no el del servidor, que en Supabase es UTC) — evita que un
-- pedido cargado a la noche ya aparezca "del día anterior".
create or replace function public.es_hoy_ar(momento timestamptz)
returns boolean
language sql
stable
as $$
  select (momento at time zone 'America/Argentina/Buenos_Aires')::date
       = (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

-- Mantiene pedidos.total = suma de pedido_items.subtotal, para que el
-- cliente nunca tenga que calcular ni enviar el total (evita que quede
-- desincronizado del detalle real del pedido).
create or replace function public.recalcular_total_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_pedido_id uuid := coalesce(new.pedido_id, old.pedido_id);
begin
  update public.pedidos
  set total = coalesce(
    (select sum(subtotal) from public.pedido_items where pedido_id = target_pedido_id),
    0
  )
  where id = target_pedido_id;
  return null;
end;
$$;

create trigger trg_recalcular_total_pedido
  after insert or update or delete on public.pedido_items
  for each row
  execute function public.recalcular_total_pedido();


-- ------------------------------------------------------------
-- 20260909000003_rls_policies.sql
-- ------------------------------------------------------------

-- Nota: no se agregan GRANT explícitos porque todo proyecto Supabase ya
-- viene con privilegios por defecto sobre el schema public para anon/
-- authenticated; acá solo se restringe a nivel de fila con RLS.
--
-- Todas las policies pasan por public.rol_actual(), que devuelve null si el
-- usuario no tiene perfil o está dado de baja. Por eso ninguna condición
-- alcanza con "estar logueado": hay que ser un usuario activo del negocio.
--
-- Nota de bootstrap: el primer usuario admin no puede darse de alta a
-- través de estas policies (rol_actual() no puede resolver un admin que
-- todavía no existe). Ese primer alta se hace por seed.sql o con la
-- service role key, que siempre bypasea RLS.

alter table public.usuarios enable row level security;
alter table public.comercios enable row level security;
alter table public.productos enable row level security;
alter table public.configuracion enable row level security;
alter table public.visitas enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;

-- usuarios: cada uno ve su propio perfil; el admin los ve y administra todos.
create policy "usuarios_select" on public.usuarios
  for select
  using (
    public.rol_actual() = 'admin'
    or (id = auth.uid() and activo)
  );

create policy "usuarios_insert_admin" on public.usuarios
  for insert
  with check (public.rol_actual() = 'admin');

create policy "usuarios_update_admin" on public.usuarios
  for update
  using (public.rol_actual() = 'admin')
  with check (public.rol_actual() = 'admin');

-- comercios: el vendedor solo lee los activos; el admin ve y administra todos.
create policy "comercios_select" on public.comercios
  for select
  using (
    public.rol_actual() = 'admin'
    or (public.rol_actual() = 'vendedor' and activo)
  );

create policy "comercios_insert_admin" on public.comercios
  for insert
  with check (public.rol_actual() = 'admin');

create policy "comercios_update_admin" on public.comercios
  for update
  using (public.rol_actual() = 'admin')
  with check (public.rol_actual() = 'admin');

-- productos: mismo patrón que comercios.
create policy "productos_select" on public.productos
  for select
  using (
    public.rol_actual() = 'admin'
    or (public.rol_actual() = 'vendedor' and activo)
  );

create policy "productos_insert_admin" on public.productos
  for insert
  with check (public.rol_actual() = 'admin');

create policy "productos_update_admin" on public.productos
  for update
  using (public.rol_actual() = 'admin')
  with check (public.rol_actual() = 'admin');

-- configuracion: cualquier usuario activo la puede leer; solo el admin la edita.
create policy "configuracion_select" on public.configuracion
  for select
  using (public.rol_actual() is not null);

create policy "configuracion_insert_admin" on public.configuracion
  for insert
  with check (public.rol_actual() = 'admin');

create policy "configuracion_update_admin" on public.configuracion
  for update
  using (public.rol_actual() = 'admin')
  with check (public.rol_actual() = 'admin');

-- visitas: es un log del escaneo, nunca se edita. El vendedor solo crea/ve
-- las propias; el admin ve todas para calcular cobertura.
create policy "visitas_select" on public.visitas
  for select
  using (
    public.rol_actual() = 'admin'
    or (public.rol_actual() = 'vendedor' and vendedor_id = auth.uid())
  );

create policy "visitas_insert_vendedor" on public.visitas
  for insert
  with check (public.rol_actual() = 'vendedor' and vendedor_id = auth.uid());

-- pedidos: el vendedor carga los propios y puede corregir/anular solo el
-- mismo día (pasado ese plazo quedan fijos, para no romper comisiones ya
-- reportadas). Se exige además que la visita citada sea del mismo vendedor,
-- para que no pueda "colgar" un pedido de una visita ajena.
create policy "pedidos_select" on public.pedidos
  for select
  using (
    public.rol_actual() = 'admin'
    or (public.rol_actual() = 'vendedor' and vendedor_id = auth.uid())
  );

create policy "pedidos_insert_vendedor" on public.pedidos
  for insert
  with check (
    public.rol_actual() = 'vendedor'
    and vendedor_id = auth.uid()
    and exists (
      select 1 from public.visitas v
      where v.id = pedidos.visita_id and v.vendedor_id = auth.uid()
    )
  );

create policy "pedidos_update_vendedor_mismo_dia" on public.pedidos
  for update
  using (
    public.rol_actual() = 'vendedor'
    and vendedor_id = auth.uid()
    and public.es_hoy_ar(fecha)
  )
  with check (
    public.rol_actual() = 'vendedor'
    and vendedor_id = auth.uid()
    and public.es_hoy_ar(fecha)
  );

create policy "pedidos_delete_vendedor_mismo_dia" on public.pedidos
  for delete
  using (
    public.rol_actual() = 'vendedor'
    and vendedor_id = auth.uid()
    and public.es_hoy_ar(fecha)
  );

-- pedido_items: hereda la visibilidad y la ventana de edición del pedido padre.
create policy "pedido_items_select" on public.pedido_items
  for select
  using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and (
          public.rol_actual() = 'admin'
          or (public.rol_actual() = 'vendedor' and p.vendedor_id = auth.uid())
        )
    )
  );

create policy "pedido_items_insert_vendedor" on public.pedido_items
  for insert
  with check (
    public.rol_actual() = 'vendedor'
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.vendedor_id = auth.uid()
    )
  );

create policy "pedido_items_update_vendedor_mismo_dia" on public.pedido_items
  for update
  using (
    public.rol_actual() = 'vendedor'
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.vendedor_id = auth.uid()
        and public.es_hoy_ar(p.fecha)
    )
  )
  with check (
    public.rol_actual() = 'vendedor'
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.vendedor_id = auth.uid()
        and public.es_hoy_ar(p.fecha)
    )
  );

create policy "pedido_items_delete_vendedor_mismo_dia" on public.pedido_items
  for delete
  using (
    public.rol_actual() = 'vendedor'
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.vendedor_id = auth.uid()
        and public.es_hoy_ar(p.fecha)
    )
  );


-- ------------------------------------------------------------
-- 20260910000001_funciones_privadas.sql
-- ------------------------------------------------------------

-- Mueve las funciones internas (usadas solo por RLS y triggers) fuera del
-- schema public. PostgREST expone automáticamente toda función de public
-- como endpoint RPC (/rest/v1/rpc/<nombre>), incluso las SECURITY DEFINER
-- que no están pensadas para llamarse directo — el linter de seguridad de
-- Supabase lo marca como "Public Can Execute SECURITY DEFINER Function".
-- rol_actual, es_hoy_ar, set_comision_pct_default y recalcular_total_pedido
-- nunca deberían llamarse desde afuera; al vivir en un schema que la API no
-- expone, ese endpoint deja de existir.
--
-- Mover una función de schema no rompe nada que ya la use: las policies y
-- los triggers la referencian por OID, no por nombre.
create schema if not exists privado;

alter function public.rol_actual() set schema privado;
alter function public.es_hoy_ar(timestamptz) set schema privado;
alter function public.set_comision_pct_default() set schema privado;
alter function public.recalcular_total_pedido() set schema privado;

-- Search path fijo, mismo motivo que en las otras funciones (aunque acá no
-- hay tablas de por medio, así queda uniforme y sin la advertencia del linter).
alter function privado.es_hoy_ar(timestamptz) set search_path = public;

-- Mismos privilegios que tenían en public: los necesitan authenticated/anon
-- para poder evaluar las RLS que las llaman (revocarlos rompería todas las
-- queries, no solo el acceso público directo).
grant usage on schema privado to anon, authenticated;
grant execute on all functions in schema privado to anon, authenticated;


-- ------------------------------------------------------------
-- 20260910000002_permitir_eliminar_admin.sql
-- ------------------------------------------------------------

-- Permite al admin eliminar definitivamente comercios, productos y usuarios,
-- además de la baja lógica ya existente con "activo". Sin estas policies, un
-- delete queda bloqueado por RLS sin ni siquiera dar error (0 filas
-- afectadas), porque no había ninguna policy "for delete" en estas tablas.
--
-- El borrado en sí solo tiene éxito si no hay visitas/pedidos que referencien
-- la fila: esas tablas no tienen "on delete cascade" hacia comercios/
-- usuarios/productos, así que el motor lo rechaza solo cuando hay historial
-- de ventas o comisiones de por medio. La UI además chequea esto antes de
-- intentarlo, para dar un mensaje claro en vez de un error de base cruda.

-- rol_actual() vive en el schema privado desde la migración
-- 20260910000001_funciones_privadas.sql, no en public.

create policy "comercios_delete_admin" on public.comercios
  for delete
  using (privado.rol_actual() = 'admin');

create policy "productos_delete_admin" on public.productos
  for delete
  using (privado.rol_actual() = 'admin');

create policy "usuarios_delete_admin" on public.usuarios
  for delete
  using (privado.rol_actual() = 'admin');
