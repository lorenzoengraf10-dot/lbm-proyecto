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
