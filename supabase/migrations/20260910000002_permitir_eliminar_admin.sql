-- Permite al admin eliminar definitivamente comercios, productos y usuarios,
-- además de la baja lógica ya existente con "activo". Sin estas policies, un
-- delete queda bloqueado por RLS sin ni siquiera dar error (0 filas
-- afectadas), porque no había ninguna policy "for delete" en estas tablas.
--
-- El borrado en sí solo tiene éxito si no hay visitas/pedidos que referencien
-- la fila: esas tablas no tienen "on delete cascade" hacia comercios/
-- usuarios/productos, así que el motor lo rechaza solo cuando hay historial
-- de ventas o comisiones de por medio. La UI además chequea esto antes de
-- intentarlo, para dar un mensaje claro en vez de un error de base cruda.

-- rol_actual() vive en el schema privado desde la migración
-- 20260910000001_funciones_privadas.sql, no en public.

create policy "comercios_delete_admin" on public.comercios
  for delete
  using (privado.rol_actual() = 'admin');

create policy "productos_delete_admin" on public.productos
  for delete
  using (privado.rol_actual() = 'admin');

create policy "usuarios_delete_admin" on public.usuarios
  for delete
  using (privado.rol_actual() = 'admin');
