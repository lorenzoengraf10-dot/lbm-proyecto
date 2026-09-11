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
