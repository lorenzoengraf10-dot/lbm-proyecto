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
