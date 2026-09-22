-- Que sincronizar_pedido no diga "listo" cuando no guardó nada.
--
-- El insert de pedidos usa "on conflict do nothing" sin decir sobre qué
-- columna, y después trata "no se insertó" como "ya estaba sincronizado".
-- Para el reintento de la cola eso es exactamente lo que hace falta: el
-- celular sube la misma fila dos veces porque se cortó la señal justo al
-- confirmar, y cortar ahí es lo que evita que los ítems se dupliquen. Eso
-- anda bien y no se toca.
--
-- El problema es que pedidos tiene DOS restricciones únicas: la clave
-- primaria y visita_id. Si el conflicto es por visita_id —misma visita, otro
-- pedido— la función también devuelve "listo" sin haber guardado nada, el
-- celular lo borra de la cola y el pedido desaparece sin que nadie se entere.
--
-- Hoy la app no puede llegar a eso: cada pedido nace con su propia visita
-- (apps/vendedor/src/app/(app)/comercios/page.tsx mintea las dos uuid juntas).
-- Pero es la clase de trampa que se activa sola el día que alguien agregue
-- "sumarle algo al pedido de esta visita", y el costo de cerrarla es una
-- consulta. Probado contra una copia: antes devolvía OK y dejaba 0 pedidos.
--
-- Distinguir los dos casos es mirar si el pedido que se quería guardar quedó:
-- si está, fue un reintento y se sale callado; si no está, la visita ya tenía
-- otro y hay que avisar. El error no pierde nada: la cola deja la fila
-- adentro con el motivo a la vista, que es lo que ya hace con cualquier
-- rechazo del servidor.
create or replace function public.sincronizar_pedido(
  p_visita_id uuid,
  p_comercio_id uuid,
  p_fecha_hora timestamptz,
  p_pedido_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_sin_qr_motivo text default null
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
  v_motivo text := nullif(btrim(coalesce(p_sin_qr_motivo, '')), '');
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

  -- Un motivo de una letra no es un motivo: si se va a saltear el QR, que
  -- quede escrito algo que se pueda leer después. Se recorta en vez de
  -- rechazar cuando se pasa de largo: el pedido importa más que el texto.
  if v_motivo is not null then
    if char_length(v_motivo) < 3 then
      raise exception 'Escribí por qué se carga sin escanear el QR';
    end if;
    v_motivo := left(v_motivo, 200);
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

  select comision_pct into v_comision_pct from usuarios where id = v_vendedor_id;

  insert into pedidos (id, visita_id, comercio_id, vendedor_id, fecha, comision_pct, sin_qr_motivo)
  values (p_pedido_id, p_visita_id, p_comercio_id, v_vendedor_id, p_fecha_hora, coalesce(v_comision_pct, 0), v_motivo)
  on conflict do nothing
  returning id into v_pedido_creado;

  if v_pedido_creado is null then
    -- No se insertó. Si el pedido está, fue un reintento de la cola: salir
    -- callado es justamente lo que evita duplicarle los ítems.
    if exists (select 1 from pedidos where id = p_pedido_id) then
      return;
    end if;
    -- Y si no está, el choque fue por visita_id: esa visita ya tiene otro
    -- pedido. Antes esto devolvía "listo" y el pedido se perdía.
    raise exception 'Esa visita ya tiene otro pedido cargado';
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
