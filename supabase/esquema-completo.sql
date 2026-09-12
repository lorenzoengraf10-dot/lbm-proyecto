-- ============================================================
-- La Buena Medida — esquema completo de la base
--
-- Pegar TODO este archivo en el SQL Editor de Supabase y ejecutar.
-- Es el mismo contenido de supabase/migrations/, junto en un solo
-- archivo para poder aplicarlo sin usar la terminal.
--
-- Se corre UNA sola vez, sobre un proyecto nuevo y vacío.
--
-- GENERADO por scripts/armar-esquema.mjs — no editarlo a mano:
-- los cambios van en supabase/migrations/ y después se regenera con
-- "pnpm esquema".
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


-- ------------------------------------------------------------
-- 20260910000003_funcion_crear_pedido.sql
-- ------------------------------------------------------------

-- Arma un pedido con sus ítems en una sola transacción: si algo falla a mitad
-- de camino (un producto que ya no está activo, por ejemplo) no queda un
-- pedido sin ítems dando vueltas. Pensada para llamarse desde la app del
-- vendedor vía supabase.rpc('crear_pedido', {...}).
--
-- security invoker (el default, pero se deja explícito porque acá es lo que
-- importa): corre con los permisos de quien la llama, así que los inserts de
-- adentro pasan por las mismas RLS de siempre (pedidos_insert_vendedor,
-- pedido_items_insert_vendedor) — a diferencia de rol_actual() y las otras
-- funciones internas, esta SÍ está pensada para exponerse como RPC público,
-- y no hace falta moverla al schema privado.
--
-- El precio de cada ítem se toma del catálogo en este mismo momento (nunca
-- del cliente), para que quede congelado al valor real de venta.
create or replace function public.crear_pedido(p_visita_id uuid, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_comercio_id uuid;
  v_vendedor_id uuid;
  v_pedido_id uuid;
  v_item jsonb;
  v_precio numeric;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido necesita al menos un ítem';
  end if;

  select comercio_id, vendedor_id into v_comercio_id, v_vendedor_id
  from visitas
  where id = p_visita_id;

  if v_comercio_id is null then
    raise exception 'La visita % no existe', p_visita_id;
  end if;

  insert into pedidos (visita_id, comercio_id, vendedor_id)
  values (p_visita_id, v_comercio_id, v_vendedor_id)
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select precio into v_precio
    from productos
    where id = (v_item->>'producto_id')::uuid and activo;

    if v_precio is null then
      raise exception 'El producto % no existe o no está activo', v_item->>'producto_id';
    end if;

    insert into pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
    values (v_pedido_id, (v_item->>'producto_id')::uuid, (v_item->>'cantidad')::numeric, v_precio);
  end loop;

  return v_pedido_id;
end;
$$;

grant execute on function public.crear_pedido(uuid, jsonb) to authenticated;


-- ------------------------------------------------------------
-- 20260911000001_editar_pedido.sql
-- ------------------------------------------------------------

-- Ventana de edición del mismo día, parte 2.
--
-- pedido_items_insert_vendedor solo exigía ser el dueño del pedido, no que el
-- pedido fuera de hoy: un vendedor podía agregarle ítems a un pedido viejo y
-- cambiarle el total, aunque update y delete sí estuvieran cerrados. Se
-- reemplaza por la misma condición que usan las otras dos policies.
--
-- Al crear un pedido nuevo esto no molesta: la fila de pedidos se inserta con
-- fecha = now(), así que es_hoy_ar(fecha) es verdadero cuando entran sus ítems.
drop policy "pedido_items_insert_vendedor" on public.pedido_items;

create policy "pedido_items_insert_vendedor" on public.pedido_items
  for insert
  with check (
    privado.rol_actual() = 'vendedor'
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.vendedor_id = auth.uid()
        and privado.es_hoy_ar(p.fecha)
    )
  );

-- Reemplaza los ítems de un pedido en una sola transacción, para que el
-- vendedor pueda corregir cantidades sin que el pedido quede a medias.
-- security invoker, igual que crear_pedido: el borrado y el alta de ítems
-- pasan por las RLS de siempre, que son las que exigen que el pedido sea
-- propio y del día.
create or replace function public.actualizar_pedido(p_pedido_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_precio numeric;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido necesita al menos un ítem';
  end if;

  delete from pedido_items where pedido_id = p_pedido_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select precio into v_precio
    from productos
    where id = (v_item->>'producto_id')::uuid and activo;

    if v_precio is null then
      raise exception 'El producto % no existe o no está activo', v_item->>'producto_id';
    end if;

    -- Si el pedido es de otro día o de otro vendedor, las RLS rechazan este
    -- insert y toda la función se deshace: no queda un pedido sin ítems.
    insert into pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
    values (p_pedido_id, (v_item->>'producto_id')::uuid, (v_item->>'cantidad')::numeric, v_precio);
  end loop;
end;
$$;

grant execute on function public.actualizar_pedido(uuid, jsonb) to authenticated;


-- ------------------------------------------------------------
-- 20260911000002_vista_cobertura.sql
-- ------------------------------------------------------------

-- Última visita por comercio, para la pantalla de cobertura del panel.
--
-- Va como vista y no como consulta en el cliente porque el panel necesita el
-- max(fecha_hora) de cada comercio: hacerlo del lado de la app obligaría a
-- traerse todo el historial de visitas, que crece para siempre.
--
-- security_invoker = true: la vista se evalúa con los permisos de quien
-- consulta, así que siguen valiendo las RLS de comercios y visitas. Sin esto
-- la vista correría como su dueño y sería un agujero (cualquier usuario vería
-- las visitas de todos).
create view public.cobertura_comercios
with (security_invoker = true) as
select
  c.id,
  c.codigo,
  c.nombre,
  c.localidad,
  max(v.fecha_hora) as ultima_visita,
  count(v.id) as visitas_totales
from public.comercios c
left join public.visitas v on v.comercio_id = c.id
where c.activo
group by c.id, c.codigo, c.nombre, c.localidad;

grant select on public.cobertura_comercios to authenticated;


-- ------------------------------------------------------------
-- 20260911000003_sincronizacion_offline.sql
-- ------------------------------------------------------------

-- Sincronización de visitas y pedidos cargados sin conexión (etapa 5).
--
-- La app del vendedor genera los UUID de la visita y del pedido en el celular,
-- antes de tener señal, y los guarda en una cola local. Esta función es la que
-- sube esa cola: es idempotente (on conflict do nothing), así que reintentar
-- la misma fila cien veces no duplica nada — que era el requisito del
-- documento original para las zonas sin señal.
--
-- security definer, a diferencia de crear_pedido: un pedido cargado ayer sin
-- señal ya no cumple la ventana de "mismo día" que exigen las RLS de
-- pedido_items, así que insertarlo con los permisos del vendedor sería
-- rechazado. La función pasa a ser la puerta de confianza y hace ella misma
-- los controles que las RLS ya no pueden hacer:
--   * exige rol vendedor activo (privado.rol_actual()),
--   * fuerza vendedor_id = auth.uid(), nunca lo toma del cliente,
--   * acota la fecha (ni futura ni de hace más de 30 días),
--   * exige que el comercio exista y esté activo,
--   * si el id de visita ya existe y es de otro vendedor, corta.
--
-- El precio de cada ítem se toma del catálogo al sincronizar, no del cliente
-- (que podría mandar cualquier cosa). Si el admin cambió un precio entre la
-- carga sin señal y la sincronización, el pedido queda con el precio nuevo;
-- es el costo de no confiar en el cliente, y con la cola vaciándose apenas
-- vuelve la señal la ventana es de horas.
create or replace function public.sincronizar_pedido(
  p_visita_id uuid,
  p_comercio_id uuid,
  p_fecha_hora timestamptz,
  p_pedido_id uuid default null,
  p_items jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid := auth.uid();
  v_pedido_creado uuid;
  v_item jsonb;
  v_precio numeric;
begin
  if privado.rol_actual() is distinct from 'vendedor' then
    raise exception 'Solo un vendedor activo puede sincronizar pedidos';
  end if;

  if p_fecha_hora > now() + interval '1 hour' then
    raise exception 'La fecha no puede estar en el futuro';
  end if;

  if p_fecha_hora < now() - interval '30 days' then
    raise exception 'La fecha es demasiado vieja para sincronizar';
  end if;

  if not exists (select 1 from comercios where id = p_comercio_id and activo) then
    raise exception 'El comercio no existe o está dado de baja';
  end if;

  insert into visitas (id, comercio_id, vendedor_id, fecha_hora)
  values (p_visita_id, p_comercio_id, v_vendedor_id, p_fecha_hora)
  on conflict (id) do nothing;

  if not exists (
    select 1 from visitas
    where id = p_visita_id and vendedor_id = v_vendedor_id and comercio_id = p_comercio_id
  ) then
    raise exception 'Esa visita ya existe y no es de este vendedor';
  end if;

  if p_pedido_id is null or jsonb_array_length(p_items) = 0 then
    return;
  end if;

  insert into pedidos (id, visita_id, comercio_id, vendedor_id, fecha)
  values (p_pedido_id, p_visita_id, p_comercio_id, v_vendedor_id, p_fecha_hora)
  on conflict (id) do nothing
  returning id into v_pedido_creado;

  -- Ya estaba sincronizado: cortar acá es lo que evita duplicar los ítems
  -- cuando el celular reintenta una fila que en realidad ya había entrado.
  if v_pedido_creado is null then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select precio into v_precio
    from productos
    where id = (v_item->>'producto_id')::uuid and activo;

    if v_precio is null then
      raise exception 'El producto % no existe o no está activo', v_item->>'producto_id';
    end if;

    insert into pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
    values (p_pedido_id, (v_item->>'producto_id')::uuid, (v_item->>'cantidad')::numeric, v_precio);
  end loop;
end;
$$;

revoke execute on function public.sincronizar_pedido(uuid, uuid, timestamptz, uuid, jsonb) from anon;
grant execute on function public.sincronizar_pedido(uuid, uuid, timestamptz, uuid, jsonb) to authenticated;


-- ------------------------------------------------------------
-- 20260911000004_cerrar_rpc_y_sync_idempotente.sql
-- ------------------------------------------------------------

-- Dos correcciones encontradas revisando lo construido.

-- 1. Cerrar las funciones RPC al público.
--
-- La migración 20260911000003 hacía "revoke execute ... from anon", pero eso
-- no sirve: Postgres le da EXECUTE a PUBLIC por defecto en toda función nueva,
-- y anon hereda de PUBLIC. Sacarle el permiso explícito a anon lo deja igual
-- con el permiso heredado, así que sincronizar_pedido (que es SECURITY
-- DEFINER) seguía siendo llamable por cualquiera con la anon key, sin sesión.
-- El linter de seguridad de Supabase lo marca como "Public Can Execute
-- SECURITY DEFINER Function".
--
-- No era explotable —la función corta con excepción si privado.rol_actual()
-- no da 'vendedor', y sin sesión auth.uid() es null—, pero un ecosistema
-- cerrado no debería depender de eso: si mañana se agrega un camino que no
-- valide el rol, la puerta ya está abierta.
--
-- Hay que revocarle a PUBLIC y TAMBIÉN a anon, porque son dos permisos
-- distintos y sacar uno deja el otro:
--   * el de PUBLIC lo trae Postgres de fábrica con cada función nueva,
--   * el de anon lo agrega Supabase con sus "alter default privileges".
-- Revocar solo a anon (lo que hacía la migración anterior) dejaba el
-- heredado de PUBLIC, y revocar solo a PUBLIC deja el explícito de anon.
-- Después se devuelve el permiso a quien de verdad lo necesita.
--
-- crear_pedido y actualizar_pedido son SECURITY INVOKER y las RLS ya las
-- protegen, pero tampoco tienen por qué ser llamables sin sesión.
revoke execute on function public.sincronizar_pedido(uuid, uuid, timestamptz, uuid, jsonb) from public, anon;
revoke execute on function public.crear_pedido(uuid, jsonb) from public, anon;
revoke execute on function public.actualizar_pedido(uuid, jsonb) from public, anon;

grant execute on function public.sincronizar_pedido(uuid, uuid, timestamptz, uuid, jsonb) to authenticated, service_role;
grant execute on function public.crear_pedido(uuid, jsonb) to authenticated, service_role;
grant execute on function public.actualizar_pedido(uuid, jsonb) to authenticated, service_role;

-- Que las funciones que se creen de acá en más no arranquen abiertas.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- 2. Sincronización realmente idempotente.
--
-- pedidos tiene DOS restricciones únicas: la clave primaria (id) y visita_id.
-- El "on conflict (id) do nothing" solo cubría la primera, así que un choque
-- por visita_id —el mismo pedido subido con otro id, o una fila de la cola
-- reintentada después de que el pedido ya entrara por otro camino— levantaba
-- una excepción de unicidad cruda en la cara del vendedor en vez de no hacer
-- nada. Sin objetivo, el "do nothing" cubre las dos.
create or replace function public.sincronizar_pedido(
  p_visita_id uuid,
  p_comercio_id uuid,
  p_fecha_hora timestamptz,
  p_pedido_id uuid default null,
  p_items jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid := auth.uid();
  v_pedido_creado uuid;
  v_item jsonb;
  v_precio numeric;
begin
  if privado.rol_actual() is distinct from 'vendedor' then
    raise exception 'Solo un vendedor activo puede sincronizar pedidos';
  end if;

  if p_fecha_hora > now() + interval '1 hour' then
    raise exception 'La fecha no puede estar en el futuro';
  end if;

  if p_fecha_hora < now() - interval '30 days' then
    raise exception 'La fecha es demasiado vieja para sincronizar';
  end if;

  if not exists (select 1 from comercios where id = p_comercio_id and activo) then
    raise exception 'El comercio no existe o está dado de baja';
  end if;

  insert into visitas (id, comercio_id, vendedor_id, fecha_hora)
  values (p_visita_id, p_comercio_id, v_vendedor_id, p_fecha_hora)
  on conflict do nothing;

  if not exists (
    select 1 from visitas
    where id = p_visita_id and vendedor_id = v_vendedor_id and comercio_id = p_comercio_id
  ) then
    raise exception 'Esa visita ya existe y no es de este vendedor';
  end if;

  if p_pedido_id is null or jsonb_array_length(p_items) = 0 then
    return;
  end if;

  insert into pedidos (id, visita_id, comercio_id, vendedor_id, fecha)
  values (p_pedido_id, p_visita_id, p_comercio_id, v_vendedor_id, p_fecha_hora)
  on conflict do nothing
  returning id into v_pedido_creado;

  -- Ya estaba sincronizado: cortar acá es lo que evita duplicar los ítems
  -- cuando el celular reintenta una fila que en realidad ya había entrado.
  if v_pedido_creado is null then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select precio into v_precio
    from productos
    where id = (v_item->>'producto_id')::uuid and activo;

    if v_precio is null then
      raise exception 'El producto % no existe o no está activo', v_item->>'producto_id';
    end if;

    insert into pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
    values (p_pedido_id, (v_item->>'producto_id')::uuid, (v_item->>'cantidad')::numeric, v_precio);
  end loop;
end;
$$;

-- create or replace repone los privilegios por defecto: hay que volver a
-- cerrarla después de redefinirla.
revoke execute on function public.sincronizar_pedido(uuid, uuid, timestamptz, uuid, jsonb) from public, anon;
grant execute on function public.sincronizar_pedido(uuid, uuid, timestamptz, uuid, jsonb) to authenticated, service_role;


-- ------------------------------------------------------------
-- 20260911000005_corregir_pedido_admin.sql
-- ------------------------------------------------------------

-- El dueño pidió poder ver el registro mensual de pedidos y, si algo se
-- cargó mal, corregirlo — incluso pasado el día en que se hizo. Hoy no puede:
-- no hay ninguna policy de update/delete para admin sobre pedidos ni
-- pedido_items, a propósito (ver docs/PLAN.md sección 12, "lo que quedó sin
-- tocar"). Esta migración lo habilita, dejando un rastro de quién corrigió,
-- cuándo y por qué.

alter table public.pedidos
  add column corregido_en timestamptz,
  add column corregido_por uuid references public.usuarios (id),
  add column motivo_correccion text;

-- security definer, como sincronizar_pedido: es un caso especial que necesita
-- saltarse la ventana del mismo día que exigen las RLS normales, así que la
-- función hace ella misma el único chequeo que hace falta (ser admin) en vez
-- de sumar una policy nueva de update/delete sobre pedido_items.
--
-- A diferencia de crear_pedido/actualizar_pedido, el precio de cada ítem NO
-- se toma del catálogo actual: viene del formulario tal cual, para no
-- re-cotizar en silencio el resto de los ítems de un pedido viejo si el
-- precio de algún producto cambió desde entonces. Tampoco exige que el
-- producto siga activo: un pedido de hace un mes puede tener un producto que
-- ya se dio de baja, y hay que poder seguir viendo y corrigiendo esa línea.
create or replace function public.corregir_pedido_admin(
  p_pedido_id uuid,
  p_items jsonb,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if privado.rol_actual() is distinct from 'admin' then
    raise exception 'Solo el administrador puede corregir un pedido';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Hay que indicar el motivo de la corrección';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido necesita al menos un ítem';
  end if;

  if not exists (select 1 from pedidos where id = p_pedido_id) then
    raise exception 'El pedido no existe';
  end if;

  delete from pedido_items where pedido_id = p_pedido_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if not exists (select 1 from productos where id = (v_item->>'producto_id')::uuid) then
      raise exception 'El producto % no existe', v_item->>'producto_id';
    end if;

    insert into pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
    values (
      p_pedido_id,
      (v_item->>'producto_id')::uuid,
      (v_item->>'cantidad')::numeric,
      (v_item->>'precio_unitario')::numeric
    );
  end loop;

  -- trg_recalcular_total_pedido ya recalculó pedidos.total con el delete y
  -- los insert de arriba: acá solo falta dejar el rastro de la corrección.
  update pedidos
  set corregido_en = now(), corregido_por = auth.uid(), motivo_correccion = p_motivo
  where id = p_pedido_id;
end;
$$;

revoke execute on function public.corregir_pedido_admin(uuid, jsonb, text) from public, anon;
grant execute on function public.corregir_pedido_admin(uuid, jsonb, text) to authenticated, service_role;


-- ------------------------------------------------------------
-- 20260912000001_estados_pago_y_comision_congelada.sql
-- ------------------------------------------------------------

-- Dos cosas que pidió el dueño y que están relacionadas:
--
-- 1. El pedido pasa por tres estados (pedido → preparado → completado) y al
--    completarlo se registra cómo se cobró: efectivo, transferencia o queda
--    debiendo (cuenta corriente, que después se marca cobrada).
-- 2. El porcentaje de comisión del repartidor se puede cambiar, pero el cambio
--    vale de ahí en adelante: los pedidos ya hechos siguen con el porcentaje
--    que tenían.
--
-- Lo segundo es lo que obliga a tocar el modelo. Hasta ahora la comisión se
-- calculaba en vivo, multiplicando el total del pedido por el porcentaje que
-- tuviera el vendedor EN ESE MOMENTO. Cambiarle el porcentaje reescribía todo
-- el historial: un reporte semanal de hace un mes pasaba a mostrar otro número.
-- La solución es la misma que ya se usa con el precio de los ítems
-- (pedido_items.precio_unitario): congelar el valor dentro del pedido cuando
-- se crea. El catálogo cambia, el pedido viejo no.

create type public.estado_pedido as enum ('pedido', 'preparado', 'completado');
create type public.forma_pago as enum ('efectivo', 'transferencia', 'cuenta_corriente');

alter table public.pedidos
  add column estado public.estado_pedido not null default 'pedido',
  add column forma_pago public.forma_pago,
  add column completado_en timestamptz,
  add column cobrado_en timestamptz,
  add column comision_pct numeric(5, 2);

-- Los pedidos que ya existen se quedan con el porcentaje que el vendedor tiene
-- hoy, que es el que estuvo vigente todo este tiempo: así los reportes
-- anteriores siguen dando exactamente lo mismo que daban antes de esta
-- migración.
update public.pedidos p
set comision_pct = u.comision_pct
from public.usuarios u
where u.id = p.vendedor_id;

alter table public.pedidos
  alter column comision_pct set not null,
  add constraint pedidos_comision_pct_valida check (comision_pct >= 0 and comision_pct <= 100);

-- Que el porcentaje lo complete un trigger y no solo las funciones: si algún
-- día entra un pedido por otro camino (una carga a mano, un script, una
-- función nueva), igual queda congelado. Es el mismo patrón que
-- trg_set_comision_pct_default sobre usuarios, un escalón más abajo.
create or replace function privado.set_comision_pct_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.comision_pct is null then
    select comision_pct into new.comision_pct from public.usuarios where id = new.vendedor_id;
    new.comision_pct := coalesce(new.comision_pct, 0);
  end if;
  return new;
end;
$$;

create trigger trg_set_comision_pct_pedido
  before insert on public.pedidos
  for each row
  execute function privado.set_comision_pct_pedido();

-- Y se dan por completados: son pedidos que en la vida real ya se entregaron y
-- se cobraron. Si quedaran en 'pedido' desaparecerían de las comisiones, que
-- ahora cuentan solo los completados. La forma de pago queda en null porque
-- no se registró en su momento; la pantalla lo muestra como "sin registrar".
update public.pedidos
set estado = 'completado', completado_en = fecha, cobrado_en = fecha;

-- El estado y el cobro tienen que ser coherentes entre sí. No se exige
-- forma_pago en todo completado justamente por los pedidos de arriba, que son
-- anteriores a que existiera el cobro; sí se exige en la función que los
-- completa de ahora en más.
alter table public.pedidos
  add constraint pedidos_estado_coherente check (
    case
      when estado = 'completado' then completado_en is not null
      else forma_pago is null and completado_en is null and cobrado_en is null
    end
  ),
  add constraint pedidos_cobro_coherente check (
    cobrado_en is null or estado = 'completado'
  );

create index idx_pedidos_estado on public.pedidos (estado);

-- Para la pantalla de "qué falta cobrar": los pedidos entregados que quedaron
-- a cuenta y todavía no se cobraron.
create index idx_pedidos_a_cobrar on public.pedidos (comercio_id)
  where forma_pago = 'cuenta_corriente' and cobrado_en is null;

-- security definer, como corregir_pedido_admin y sincronizar_pedido: mover el
-- estado no encaja en las RLS que hay. Las de pedidos solo permiten insertar y
-- editar dentro del mismo día, y acá hace falta lo contrario — un pedido
-- cargado ayer se entrega hoy, y eso es lo normal, no la excepción. Así que la
-- función hace ella misma el control: el admin puede mover cualquier pedido, el
-- vendedor solo los suyos.
--
-- No se abre una policy de update sobre pedidos: eso le daría al vendedor
-- permiso para tocar también el total o la fecha. Esta función es la única
-- puerta, y solo mueve las columnas del estado y del cobro.
create or replace function public.cambiar_estado_pedido(
  p_pedido_id uuid,
  p_estado public.estado_pedido,
  p_forma_pago public.forma_pago default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := privado.rol_actual();
  v_vendedor_id uuid;
begin
  select vendedor_id into v_vendedor_id from pedidos where id = p_pedido_id;

  if v_vendedor_id is null then
    raise exception 'El pedido no existe';
  end if;

  if v_rol = 'vendedor' and v_vendedor_id is distinct from auth.uid() then
    raise exception 'Solo se puede cambiar el estado de los pedidos propios';
  end if;

  if v_rol is distinct from 'admin' and v_rol is distinct from 'vendedor' then
    raise exception 'No tenés permiso para cambiar el estado de un pedido';
  end if;

  if p_estado = 'completado' then
    if p_forma_pago is null then
      raise exception 'Hay que indicar cómo se cobró el pedido';
    end if;

    update pedidos
    set estado = 'completado',
        forma_pago = p_forma_pago,
        completado_en = coalesce(completado_en, now()),
        -- Efectivo y transferencia se cobran al entregar. La cuenta corriente
        -- queda debiendo hasta que alguien la marque cobrada.
        cobrado_en = case when p_forma_pago = 'cuenta_corriente' then null else now() end
    where id = p_pedido_id;
  else
    -- Volver atrás sirve para corregir un estado marcado por error. Se limpia
    -- el cobro porque el pedido deja de estar entregado.
    update pedidos
    set estado = p_estado, forma_pago = null, completado_en = null, cobrado_en = null
    where id = p_pedido_id;
  end if;
end;
$$;

revoke execute on function public.cambiar_estado_pedido(uuid, public.estado_pedido, public.forma_pago) from public, anon;
grant execute on function public.cambiar_estado_pedido(uuid, public.estado_pedido, public.forma_pago) to authenticated, service_role;

-- Cuando el comercio paga lo que había quedado a cuenta.
create or replace function public.marcar_cobrado(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := privado.rol_actual();
  v_vendedor_id uuid;
  v_forma public.forma_pago;
  v_cobrado timestamptz;
begin
  select vendedor_id, forma_pago, cobrado_en
    into v_vendedor_id, v_forma, v_cobrado
  from pedidos where id = p_pedido_id;

  if v_vendedor_id is null then
    raise exception 'El pedido no existe';
  end if;

  if v_rol = 'vendedor' and v_vendedor_id is distinct from auth.uid() then
    raise exception 'Solo se puede cobrar un pedido propio';
  end if;

  if v_rol is distinct from 'admin' and v_rol is distinct from 'vendedor' then
    raise exception 'No tenés permiso para cobrar un pedido';
  end if;

  if v_forma is distinct from 'cuenta_corriente' then
    raise exception 'Ese pedido no quedó a cuenta';
  end if;

  if v_cobrado is not null then
    return;
  end if;

  update pedidos set cobrado_en = now() where id = p_pedido_id;
end;
$$;

revoke execute on function public.marcar_cobrado(uuid) from public, anon;
grant execute on function public.marcar_cobrado(uuid) to authenticated, service_role;

-- crear_pedido y sincronizar_pedido se rehacen solo para copiar el porcentaje
-- de comisión del vendedor dentro del pedido. Es el momento exacto en que hay
-- que congelarlo: de ahí en más, cambiar el porcentaje del vendedor no toca
-- este pedido. El resto de las dos funciones queda igual.
create or replace function public.crear_pedido(p_visita_id uuid, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_comercio_id uuid;
  v_vendedor_id uuid;
  v_comision_pct numeric;
  v_pedido_id uuid;
  v_item jsonb;
  v_precio numeric;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido necesita al menos un ítem';
  end if;

  select comercio_id, vendedor_id into v_comercio_id, v_vendedor_id
  from visitas
  where id = p_visita_id;

  if v_comercio_id is null then
    raise exception 'La visita % no existe', p_visita_id;
  end if;

  select comision_pct into v_comision_pct from usuarios where id = v_vendedor_id;

  insert into pedidos (visita_id, comercio_id, vendedor_id, comision_pct)
  values (p_visita_id, v_comercio_id, v_vendedor_id, coalesce(v_comision_pct, 0))
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select precio into v_precio
    from productos
    where id = (v_item->>'producto_id')::uuid and activo;

    if v_precio is null then
      raise exception 'El producto % no existe o no está activo', v_item->>'producto_id';
    end if;

    insert into pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
    values (v_pedido_id, (v_item->>'producto_id')::uuid, (v_item->>'cantidad')::numeric, v_precio);
  end loop;

  return v_pedido_id;
end;
$$;

grant execute on function public.crear_pedido(uuid, jsonb) to authenticated;

-- El pedido cargado sin señal congela el porcentaje que el vendedor tiene al
-- sincronizar, no al cargarlo. Es la misma decisión que ya se tomó con el
-- precio de los ítems (ver el comentario de la migración de sincronización):
-- no se le cree al cliente, y la ventana entre una cosa y la otra son horas.
create or replace function public.sincronizar_pedido(
  p_visita_id uuid,
  p_comercio_id uuid,
  p_fecha_hora timestamptz,
  p_pedido_id uuid default null,
  p_items jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid := auth.uid();
  v_comision_pct numeric;
  v_pedido_creado uuid;
  v_item jsonb;
  v_precio numeric;
begin
  if privado.rol_actual() is distinct from 'vendedor' then
    raise exception 'Solo un vendedor activo puede sincronizar pedidos';
  end if;

  if p_fecha_hora > now() + interval '1 hour' then
    raise exception 'La fecha no puede estar en el futuro';
  end if;

  if p_fecha_hora < now() - interval '30 days' then
    raise exception 'La fecha es demasiado vieja para sincronizar';
  end if;

  if not exists (select 1 from comercios where id = p_comercio_id and activo) then
    raise exception 'El comercio no existe o está dado de baja';
  end if;

  insert into visitas (id, comercio_id, vendedor_id, fecha_hora)
  values (p_visita_id, p_comercio_id, v_vendedor_id, p_fecha_hora)
  on conflict (id) do nothing;

  if not exists (
    select 1 from visitas
    where id = p_visita_id and vendedor_id = v_vendedor_id and comercio_id = p_comercio_id
  ) then
    raise exception 'Esa visita ya existe y no es de este vendedor';
  end if;

  if p_pedido_id is null or jsonb_array_length(p_items) = 0 then
    return;
  end if;

  select comision_pct into v_comision_pct from usuarios where id = v_vendedor_id;

  insert into pedidos (id, visita_id, comercio_id, vendedor_id, fecha, comision_pct)
  values (p_pedido_id, p_visita_id, p_comercio_id, v_vendedor_id, p_fecha_hora, coalesce(v_comision_pct, 0))
  on conflict (id) do nothing
  returning id into v_pedido_creado;

  -- Ya estaba sincronizado: cortar acá es lo que evita duplicar los ítems
  -- cuando el celular reintenta una fila que en realidad ya había entrado.
  if v_pedido_creado is null then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select precio into v_precio
    from productos
    where id = (v_item->>'producto_id')::uuid and activo;

    if v_precio is null then
      raise exception 'El producto % no existe o no está activo', v_item->>'producto_id';
    end if;

    insert into pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
    values (p_pedido_id, (v_item->>'producto_id')::uuid, (v_item->>'cantidad')::numeric, v_precio);
  end loop;
end;
$$;

revoke execute on function public.sincronizar_pedido(uuid, uuid, timestamptz, uuid, jsonb) from public, anon;
grant execute on function public.sincronizar_pedido(uuid, uuid, timestamptz, uuid, jsonb) to authenticated;


-- ------------------------------------------------------------
-- 20260912000002_login_con_pin.sql
-- ------------------------------------------------------------

-- El repartidor entra con su nombre y un PIN de 6 dígitos, sin escribir una
-- contraseña larga. Eso es más rápido en la calle, pero un PIN es un secreto
-- chico: un millón de combinaciones se prueban solas si alguien puede
-- intentar sin límite. Dos cosas lo sostienen:
--
-- 1. El PIN NO es la contraseña de Supabase Auth. La contraseña real se deriva
--    en el servidor (HMAC del PIN con un secreto que solo vive ahí), así que
--    nadie puede probar PIN contra el endpoint de Auth: sin el secreto, no
--    sabe qué mandar. Todo intento tiene que pasar por la app.
-- 2. Y como pasa por la app, ahí sí se puede contar y frenar: cinco errores
--    seguidos bloquean la cuenta un rato.
--
-- Esta tabla es lo segundo. Vive en public porque el cliente de service role
-- llega por PostgREST, que solo expone public — pero con RLS activada y SIN
-- ninguna policy: nadie puede leerla ni escribirla, y el service role la toca
-- porque saltea RLS por definición. Los permisos además se revocan a mano,
-- para no depender de una sola barrera.
create table public.intentos_pin (
  usuario_id uuid primary key references public.usuarios (id) on delete cascade,
  fallidos smallint not null default 0,
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz not null default now()
);

alter table public.intentos_pin enable row level security;

revoke all on public.intentos_pin from anon, authenticated;
grant all on public.intentos_pin to service_role;
