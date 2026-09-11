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
