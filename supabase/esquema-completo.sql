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
