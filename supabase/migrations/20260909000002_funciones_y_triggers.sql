-- Devuelve el rol del usuario autenticado actual.
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
  select rol from public.usuarios where id = auth.uid();
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
