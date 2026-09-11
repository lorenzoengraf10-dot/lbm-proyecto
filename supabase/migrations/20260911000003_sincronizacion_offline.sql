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
