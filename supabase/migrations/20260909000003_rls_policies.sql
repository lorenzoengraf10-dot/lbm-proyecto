-- Nota: no se agregan GRANT explícitos porque todo proyecto Supabase ya
-- viene con privilegios por defecto sobre el schema public para anon/
-- authenticated; acá solo se restringe a nivel de fila con RLS.
--
-- Todas las policies pasan por public.rol_actual(), que devuelve null si el
-- usuario no tiene perfil o está dado de baja. Por eso ninguna condición
-- alcanza con "estar logueado": hay que ser un usuario activo del negocio.
--
-- Nota de bootstrap: el primer usuario admin no puede darse de alta a
-- través de estas policies (rol_actual() no puede resolver un admin que
-- todavía no existe). Ese primer alta se hace por seed.sql o con la
-- service role key, que siempre bypasea RLS.

alter table public.usuarios enable row level security;
alter table public.comercios enable row level security;
alter table public.productos enable row level security;
alter table public.configuracion enable row level security;
alter table public.visitas enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;

-- usuarios: cada uno ve su propio perfil; el admin los ve y administra todos.
create policy "usuarios_select" on public.usuarios
  for select
  using (
    public.rol_actual() = 'admin'
    or (id = auth.uid() and activo)
  );

create policy "usuarios_insert_admin" on public.usuarios
  for insert
  with check (public.rol_actual() = 'admin');

create policy "usuarios_update_admin" on public.usuarios
  for update
  using (public.rol_actual() = 'admin')
  with check (public.rol_actual() = 'admin');

-- comercios: el vendedor solo lee los activos; el admin ve y administra todos.
create policy "comercios_select" on public.comercios
  for select
  using (
    public.rol_actual() = 'admin'
    or (public.rol_actual() = 'vendedor' and activo)
  );

create policy "comercios_insert_admin" on public.comercios
  for insert
  with check (public.rol_actual() = 'admin');

create policy "comercios_update_admin" on public.comercios
  for update
  using (public.rol_actual() = 'admin')
  with check (public.rol_actual() = 'admin');

-- productos: mismo patrón que comercios.
create policy "productos_select" on public.productos
  for select
  using (
    public.rol_actual() = 'admin'
    or (public.rol_actual() = 'vendedor' and activo)
  );

create policy "productos_insert_admin" on public.productos
  for insert
  with check (public.rol_actual() = 'admin');

create policy "productos_update_admin" on public.productos
  for update
  using (public.rol_actual() = 'admin')
  with check (public.rol_actual() = 'admin');

-- configuracion: cualquier usuario activo la puede leer; solo el admin la edita.
create policy "configuracion_select" on public.configuracion
  for select
  using (public.rol_actual() is not null);

create policy "configuracion_insert_admin" on public.configuracion
  for insert
  with check (public.rol_actual() = 'admin');

create policy "configuracion_update_admin" on public.configuracion
  for update
  using (public.rol_actual() = 'admin')
  with check (public.rol_actual() = 'admin');

-- visitas: es un log del escaneo, nunca se edita. El vendedor solo crea/ve
-- las propias; el admin ve todas para calcular cobertura.
create policy "visitas_select" on public.visitas
  for select
  using (
    public.rol_actual() = 'admin'
    or (public.rol_actual() = 'vendedor' and vendedor_id = auth.uid())
  );

create policy "visitas_insert_vendedor" on public.visitas
  for insert
  with check (public.rol_actual() = 'vendedor' and vendedor_id = auth.uid());

-- pedidos: el vendedor carga los propios y puede corregir/anular solo el
-- mismo día (pasado ese plazo quedan fijos, para no romper comisiones ya
-- reportadas). Se exige además que la visita citada sea del mismo vendedor,
-- para que no pueda "colgar" un pedido de una visita ajena.
create policy "pedidos_select" on public.pedidos
  for select
  using (
    public.rol_actual() = 'admin'
    or (public.rol_actual() = 'vendedor' and vendedor_id = auth.uid())
  );

create policy "pedidos_insert_vendedor" on public.pedidos
  for insert
  with check (
    public.rol_actual() = 'vendedor'
    and vendedor_id = auth.uid()
    and exists (
      select 1 from public.visitas v
      where v.id = pedidos.visita_id and v.vendedor_id = auth.uid()
    )
  );

create policy "pedidos_update_vendedor_mismo_dia" on public.pedidos
  for update
  using (
    public.rol_actual() = 'vendedor'
    and vendedor_id = auth.uid()
    and public.es_hoy_ar(fecha)
  )
  with check (
    public.rol_actual() = 'vendedor'
    and vendedor_id = auth.uid()
    and public.es_hoy_ar(fecha)
  );

create policy "pedidos_delete_vendedor_mismo_dia" on public.pedidos
  for delete
  using (
    public.rol_actual() = 'vendedor'
    and vendedor_id = auth.uid()
    and public.es_hoy_ar(fecha)
  );

-- pedido_items: hereda la visibilidad y la ventana de edición del pedido padre.
create policy "pedido_items_select" on public.pedido_items
  for select
  using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and (
          public.rol_actual() = 'admin'
          or (public.rol_actual() = 'vendedor' and p.vendedor_id = auth.uid())
        )
    )
  );

create policy "pedido_items_insert_vendedor" on public.pedido_items
  for insert
  with check (
    public.rol_actual() = 'vendedor'
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.vendedor_id = auth.uid()
    )
  );

create policy "pedido_items_update_vendedor_mismo_dia" on public.pedido_items
  for update
  using (
    public.rol_actual() = 'vendedor'
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.vendedor_id = auth.uid()
        and public.es_hoy_ar(p.fecha)
    )
  )
  with check (
    public.rol_actual() = 'vendedor'
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.vendedor_id = auth.uid()
        and public.es_hoy_ar(p.fecha)
    )
  );

create policy "pedido_items_delete_vendedor_mismo_dia" on public.pedido_items
  for delete
  using (
    public.rol_actual() = 'vendedor'
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.vendedor_id = auth.uid()
        and public.es_hoy_ar(p.fecha)
    )
  );
