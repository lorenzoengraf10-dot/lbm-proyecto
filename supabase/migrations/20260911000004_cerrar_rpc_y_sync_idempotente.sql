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
