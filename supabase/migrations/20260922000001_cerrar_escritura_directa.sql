-- Cerrar la escritura directa contra las tablas.
--
-- Auditoría del 22/09: la base tenía tres agujeros, y los tres venían del
-- mismo malentendido. Las RLS son POR FILA, no por columna: una policy de
-- UPDATE que dice "este pedido es tuyo y es de hoy" deja escribir CUALQUIER
-- columna de esa fila. Y los permisos de tabla son otra capa distinta de las
-- policies: Supabase le da de fábrica a anon y authenticated todos los
-- privilegios sobre el schema public, TRUNCATE incluido, y TRUNCATE no pasa
-- por las RLS.
--
-- Lo que se podía hacer desde la app del repartidor, con su propio token, sin
-- tocar nada del celular (probado contra una copia de la base):
--
--   1. update pedidos set total = 819000, comision_pct = 20 where id = <suyo>
--      Su comisión de un pedido pasaba de $1.092 a $163.800. La policy lo
--      dejaba pasar porque el pedido era suyo y del día.
--
--   2. insert into pedido_items (..., precio_unitario) values (..., 999999)
--      El trigger recalcula el total con el precio que vino en el insert, no
--      con el de la lista: un pedido de $30.000 quedaba en $10.029.999.
--
--   3. truncate pedidos, pedido_items, comercios, productos, usuarios...
--      Desde anon, ni siquiera hacía falta estar logueado.
--
-- El arreglo NO afloja ninguna policy: al revés, saca los privilegios de
-- tabla que la app nunca usó y deja el resto donde ya estaba. La regla que
-- queda es "todo lo que escribe pedidos pasa por una función con su propio
-- control de permisos", que es lo que ya hacían sincronizar_pedido,
-- cambiar_estado_pedido, marcar_cobrado y corregir_pedido_admin.

-- ---------------------------------------------------------------------------
-- 1. actualizar_pedido pasa a security definer, con el control adentro
-- ---------------------------------------------------------------------------
-- Era la única función que seguía siendo security invoker, y por eso era la
-- única razón por la que el repartidor necesitaba insert y delete sobre
-- pedido_items. Ese permiso era el agujero nº 2: la función pone el precio de
-- la lista, pero nada obligaba a pasar POR la función.
--
-- Al hacerla definer hay que traer adentro lo que antes chequeaban las
-- policies (que el pedido sea propio y del día), porque el dueño de la tabla
-- no pasa por las RLS. Se chequea ANTES del delete, no después: con definer,
-- un delete sin filtrar por permisos sí borraría los ítems de un pedido ajeno.
create or replace function public.actualizar_pedido(p_pedido_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_precio numeric;
  v_rol text := privado.rol_actual();
  v_vendedor_id uuid;
  v_fecha timestamptz;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido necesita al menos un ítem';
  end if;

  select vendedor_id, fecha into v_vendedor_id, v_fecha
  from pedidos where id = p_pedido_id;

  if v_vendedor_id is null then
    raise exception 'El pedido no existe';
  end if;

  -- El admin no entra por acá: para corregir un pedido viejo tiene
  -- corregir_pedido_admin, que además deja el motivo anotado. Esto repite lo
  -- que decían las policies que se dan de baja más abajo.
  if v_rol is distinct from 'vendedor' then
    raise exception 'Solo el repartidor corrige sus propios pedidos';
  end if;

  if v_vendedor_id is distinct from auth.uid() then
    raise exception 'Solo se puede corregir un pedido propio';
  end if;

  if not privado.es_hoy_ar(v_fecha) then
    raise exception 'Un pedido de otro día ya no se puede corregir';
  end if;

  delete from pedido_items where pedido_id = p_pedido_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- El precio sale SIEMPRE de la lista, nunca de lo que mandó el cliente.
    -- Esa es toda la defensa contra el agujero nº 2.
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

-- ---------------------------------------------------------------------------
-- 2. crear_pedido se da de baja
-- ---------------------------------------------------------------------------
-- Quedó sin uso cuando el pedido pasó a cargarse siempre por sincronizar_pedido
-- (la app guarda primero en el celular y sube después, haya o no señal). Era
-- la otra función security invoker, así que sin los permisos de tabla que se
-- sacan abajo quedaría rota igual. Una función rota que alguien vuelve a
-- llamar dentro de un año es peor que una que no está.
drop function if exists public.crear_pedido(uuid, jsonb);

-- ---------------------------------------------------------------------------
-- 3. Las policies que quedan sin efecto se dan de baja
-- ---------------------------------------------------------------------------
-- No es cosmético. Con RLS prendida y SIN policy, la respuesta es "no". Con
-- la policy puesta pero sin el privilegio de tabla, la respuesta también es
-- "no"... hasta que alguien devuelve el privilegio (un grant de más en una
-- migración futura, o el default de Supabase al crear algo) y ahí la policy
-- vuelve a abrir la puerta sola. Borrarlas hace que reabrir el agujero
-- necesite dos errores en vez de uno.
drop policy if exists "pedidos_insert_vendedor" on public.pedidos;
drop policy if exists "pedidos_update_vendedor_mismo_dia" on public.pedidos;
drop policy if exists "pedido_items_insert_vendedor" on public.pedido_items;
drop policy if exists "pedido_items_update_vendedor_mismo_dia" on public.pedido_items;
drop policy if exists "pedido_items_delete_vendedor_mismo_dia" on public.pedido_items;
drop policy if exists "visitas_insert_vendedor" on public.visitas;
drop policy if exists "usuarios_insert_admin" on public.usuarios;
drop policy if exists "usuarios_delete_admin" on public.usuarios;
drop policy if exists "configuracion_insert_admin" on public.configuracion;
drop policy if exists "configuracion_update_admin" on public.configuracion;

-- pedidos_delete_vendedor_mismo_dia SE QUEDA: es la que sostiene "anular el
-- pedido el mismo día", el único write directo que hace la app del repartidor
-- (apps/vendedor/src/app/(app)/mis-pedidos/actions.ts). Un delete no puede
-- falsear una columna, así que el problema de arriba no aplica.

-- ---------------------------------------------------------------------------
-- 4. Los privilegios de tabla: se sacan todos y se devuelve solo lo que se usa
-- ---------------------------------------------------------------------------
-- anon no necesita absolutamente nada: todas las policies exigen un rol, y
-- sin sesión privado.rol_actual() es null. Lo único que hacía con estos
-- permisos era TRUNCATE, que se saltea las RLS.
revoke all on public.usuarios      from anon, authenticated;
revoke all on public.comercios     from anon, authenticated;
revoke all on public.productos     from anon, authenticated;
revoke all on public.configuracion from anon, authenticated;
revoke all on public.visitas       from anon, authenticated;
revoke all on public.pedidos       from anon, authenticated;
revoke all on public.pedido_items  from anon, authenticated;
revoke all on public.cobertura_comercios from anon, authenticated;

-- Leer: lo filtran las policies de select, que no cambian.
grant select on public.usuarios            to authenticated;
grant select on public.comercios           to authenticated;
grant select on public.productos           to authenticated;
grant select on public.configuracion       to authenticated;
grant select on public.visitas             to authenticated;
grant select on public.pedidos             to authenticated;
grant select on public.pedido_items        to authenticated;
grant select on public.cobertura_comercios to authenticated;

-- Escribir: solo el ABM del panel, que ya está cerrado a rol admin por las
-- policies *_admin, y el "anular pedido" del repartidor.
grant insert, update, delete on public.comercios to authenticated;
grant insert, update, delete on public.productos to authenticated;
grant update                 on public.usuarios  to authenticated;
grant delete                 on public.pedidos   to authenticated;

-- Lo que NO se devuelve, y por qué:
--   pedidos      insert/update  → sincronizar_pedido, cambiar_estado_pedido,
--                                 marcar_cobrado y corregir_pedido_admin son
--                                 security definer y no lo necesitan.
--   pedido_items todo           → actualizar_pedido ahora es definer.
--   visitas      insert         → las crea sincronizar_pedido.
--   usuarios     insert/delete  → los hace el panel con la clave de servicio,
--                                 porque también hay que tocar auth.users.
--   configuracion insert/update → no hay pantalla que lo escriba.
--   TRUNCATE     en todas       → nunca lo usó nadie, y no mira las RLS.

-- ---------------------------------------------------------------------------
-- 5. Que una tabla nueva no vuelva a nacer abierta
-- ---------------------------------------------------------------------------
-- Este es el origen de todo: el default de Supabase para el schema public es
-- "arwdDxtm a anon y a authenticated", o sea todo, TRUNCATE incluido. Cada
-- tabla que se cree hereda eso salvo que se diga lo contrario.
--
-- OJO al escribir la próxima migración que cree una tabla: después del
-- create table hay que agregar a mano el
--     grant select on public.<tabla> to authenticated;
-- que haga falta. Si la pantalla dice "permission denied for table", es esto,
-- y está bien que sea así: se prefiere una pantalla rota y visible a una
-- tabla abierta y silenciosa.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
