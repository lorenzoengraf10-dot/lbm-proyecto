-- El repartidor entra con su nombre y un PIN de 6 dígitos, sin escribir una
-- contraseña larga. Eso es más rápido en la calle, pero un PIN es un secreto
-- chico: un millón de combinaciones se prueban solas si alguien puede
-- intentar sin límite. Dos cosas lo sostienen:
--
-- 1. El PIN NO es la contraseña de Supabase Auth. La contraseña real se deriva
--    en el servidor (HMAC del PIN con un secreto que solo vive ahí), así que
--    nadie puede probar PIN contra el endpoint de Auth: sin el secreto, no
--    sabe qué mandar. Todo intento tiene que pasar por la app.
-- 2. Y como pasa por la app, ahí sí se puede contar y frenar: cinco errores
--    seguidos bloquean la cuenta un rato.
--
-- Esta tabla es lo segundo. Vive en public porque el cliente de service role
-- llega por PostgREST, que solo expone public — pero con RLS activada y SIN
-- ninguna policy: nadie puede leerla ni escribirla, y el service role la toca
-- porque saltea RLS por definición. Los permisos además se revocan a mano,
-- para no depender de una sola barrera.
create table public.intentos_pin (
  usuario_id uuid primary key references public.usuarios (id) on delete cascade,
  fallidos smallint not null default 0,
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz not null default now()
);

alter table public.intentos_pin enable row level security;

revoke all on public.intentos_pin from anon, authenticated;
grant all on public.intentos_pin to service_role;
