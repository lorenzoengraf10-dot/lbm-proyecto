-- Dos cosas que marcó el linter de Supabase en la auditoría del 22/09.
-- Ninguna se nota hoy, con cinco comercios y unos pocos pedidos por día. Las
-- dos empiezan a notarse con un par de años de historial encima, que es
-- exactamente cuando nadie se acuerda de por qué la planilla tarda.

-- ---------------------------------------------------------------------------
-- 1. Dos claves foráneas sin índice
-- ---------------------------------------------------------------------------
-- pedido_items.producto_id es la que importa: el bloque "Para preparar" de la
-- planilla agrupa por producto, y el reporte semanal arma el ranking igual.
-- Sin índice, cada uno de esos agrupamientos recorre la tabla entera de ítems.
--
-- pedidos.corregido_por casi no se consulta, pero sin índice cada borrado de
-- un usuario tiene que recorrer pedidos entero para comprobar la foránea.
create index if not exists idx_pedido_items_producto on public.pedido_items (producto_id);
create index if not exists idx_pedidos_corregido_por on public.pedidos (corregido_por)
  where corregido_por is not null;

-- ---------------------------------------------------------------------------
-- 2. Las policies llamaban a auth.uid() una vez POR FILA
-- ---------------------------------------------------------------------------
-- Escrito así, Postgres trata auth.uid() y privado.rol_actual() como algo que
-- puede cambiar de fila en fila y las vuelve a evaluar en cada una. Envueltas
-- en (select ...) las calcula una sola vez por consulta y compara contra ese
-- valor. Es el patrón que recomienda Supabase y no cambia en nada a quién deja
-- pasar: son las mismas condiciones, con un paréntesis.
--
-- Se recrean enteras en vez de "alterarlas" porque Postgres no deja cambiar la
-- expresión de una policy sin volver a escribirla.

drop policy if exists "usuarios_select" on public.usuarios;
create policy "usuarios_select" on public.usuarios
  for select
  using (
    (select privado.rol_actual()) = 'admin'
    or (id = (select auth.uid()) and activo)
  );

drop policy if exists "visitas_select" on public.visitas;
create policy "visitas_select" on public.visitas
  for select
  using (
    (select privado.rol_actual()) = 'admin'
    or ((select privado.rol_actual()) = 'vendedor' and vendedor_id = (select auth.uid()))
  );

drop policy if exists "pedidos_select" on public.pedidos;
create policy "pedidos_select" on public.pedidos
  for select
  using (
    (select privado.rol_actual()) = 'admin'
    or ((select privado.rol_actual()) = 'vendedor' and vendedor_id = (select auth.uid()))
  );

-- La única que sigue dejando escribir directo: es la que sostiene "anular el
-- pedido el mismo día" en la app del repartidor.
drop policy if exists "pedidos_delete_vendedor_mismo_dia" on public.pedidos;
create policy "pedidos_delete_vendedor_mismo_dia" on public.pedidos
  for delete
  using (
    (select privado.rol_actual()) = 'vendedor'
    and vendedor_id = (select auth.uid())
    and privado.es_hoy_ar(fecha)
  );

drop policy if exists "pedido_items_select" on public.pedido_items;
create policy "pedido_items_select" on public.pedido_items
  for select
  using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and (
          (select privado.rol_actual()) = 'admin'
          or ((select privado.rol_actual()) = 'vendedor' and p.vendedor_id = (select auth.uid()))
        )
    )
  );

-- es_hoy_ar(fecha) se queda sin envolver a propósito: depende de la fila, así
-- que ahí sí hay que evaluarla una vez por cada una.
