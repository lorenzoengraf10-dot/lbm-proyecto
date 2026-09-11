-- Última visita por comercio, para la pantalla de cobertura del panel.
--
-- Va como vista y no como consulta en el cliente porque el panel necesita el
-- max(fecha_hora) de cada comercio: hacerlo del lado de la app obligaría a
-- traerse todo el historial de visitas, que crece para siempre.
--
-- security_invoker = true: la vista se evalúa con los permisos de quien
-- consulta, así que siguen valiendo las RLS de comercios y visitas. Sin esto
-- la vista correría como su dueño y sería un agujero (cualquier usuario vería
-- las visitas de todos).
create view public.cobertura_comercios
with (security_invoker = true) as
select
  c.id,
  c.codigo,
  c.nombre,
  c.localidad,
  max(v.fecha_hora) as ultima_visita,
  count(v.id) as visitas_totales
from public.comercios c
left join public.visitas v on v.comercio_id = c.id
where c.activo
group by c.id, c.codigo, c.nombre, c.localidad;

grant select on public.cobertura_comercios to authenticated;
