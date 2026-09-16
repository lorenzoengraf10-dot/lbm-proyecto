-- El pedido se toma escaneando el QR pegado en el comercio.
--
-- Por qué: el QR es la única prueba de que el repartidor estuvo parado en la
-- puerta. Eligiendo el comercio de una lista, un pedido se puede cargar desde
-- cualquier lado, y ahí "visitado" deja de querer decir nada.
--
-- Pero un candado sin salida cuesta ventas: el día que un cartel se despega,
-- se borra con el sol o el comercio lo tapa con una heladera, el repartidor
-- está ahí con el pedido y no puede cargarlo. Así que el camino normal es el
-- QR, y el de excepción existe pero deja rastro: hay que escribir por qué, y
-- el pedido queda marcado para que el dueño lo vea.
--
-- null = se escaneó el QR, que es lo normal y lo que no hace falta explicar.
alter table public.pedidos add column sin_qr_motivo text;

alter table public.pedidos
  add constraint pedidos_sin_qr_motivo_razonable
  check (
    sin_qr_motivo is null
    or (btrim(sin_qr_motivo) = sin_qr_motivo and char_length(sin_qr_motivo) between 3 and 200)
  );

-- Son la excepción, así que el índice solo cubre esos.
create index idx_pedidos_sin_qr on public.pedidos (fecha desc) where sin_qr_motivo is not null;

-- sincronizar_pedido pasa a recibir el motivo.
--
-- El cuerpo es EL QUE ESTÁ CORRIENDO HOY (migración 20260912000001, verificado
-- contra la base de producción con pg_get_functiondef), con dos cambios y nada
-- más:
--
-- 1. El motivo.
--
-- 2. Vuelve el "on conflict do nothing" SIN objetivo. La migración
--    20260911000004 lo había arreglado y 20260912000001 lo pisó sin querer al
--    redefinir la función entera para congelar la comisión. El problema es
--    este: pedidos tiene DOS restricciones únicas —la clave primaria (id) y
--    visita_id— así que "on conflict (id)" solo cubre una. Un choque por
--    visita_id (el mismo pedido subido con otro id, o una fila de la cola
--    reintentada después de que el pedido ya entró por otro camino) levanta
--    una excepción de unicidad cruda en la cara del repartidor en vez de no
--    hacer nada. Sin objetivo, cubre las dos.
--
-- Lo demás se conserva tal cual, porque cada cosa arregló algo que costó
-- encontrar: el chequeo de que la visita sea de este vendedor Y de este
-- comercio, el corte cuando el pedido ya estaba subido (que es lo que evita
-- duplicar los ítems al reintentar), y la comisión leída del vendedor al
-- crear el pedido.
--
-- El parámetro va al final y con valor por defecto. PostgREST resuelve la
-- llamada por los nombres que le mandan, así que la app vieja que todavía no
-- manda el motivo sigue funcionando contra esta función: se puede aplicar la
-- migración primero y redeployar después, sin ventana rota.
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
revoke execute on function public.sincronizar_pedido(uuid, uuid, timestamptz, uuid, jsonb, text) from public, anon;
grant execute on function public.sincronizar_pedido(uuid, uuid, timestamptz, uuid, jsonb, text) to authenticated, service_role;

-- La firma vieja (sin el motivo) queda huérfana: PostgreSQL la trata como otra
-- función porque cambió la cantidad de parámetros. Se borra para que no quede
-- una puerta de atrás que se saltea el motivo.
drop function if exists public.sincronizar_pedido(uuid, uuid, timestamptz, uuid, jsonb);
