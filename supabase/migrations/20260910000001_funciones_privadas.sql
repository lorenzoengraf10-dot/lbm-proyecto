-- Mueve las funciones internas (usadas solo por RLS y triggers) fuera del
-- schema public. PostgREST expone automáticamente toda función de public
-- como endpoint RPC (/rest/v1/rpc/<nombre>), incluso las SECURITY DEFINER
-- que no están pensadas para llamarse directo — el linter de seguridad de
-- Supabase lo marca como "Public Can Execute SECURITY DEFINER Function".
-- rol_actual, es_hoy_ar, set_comision_pct_default y recalcular_total_pedido
-- nunca deberían llamarse desde afuera; al vivir en un schema que la API no
-- expone, ese endpoint deja de existir.
--
-- Mover una función de schema no rompe nada que ya la use: las policies y
-- los triggers la referencian por OID, no por nombre.
create schema if not exists privado;

alter function public.rol_actual() set schema privado;
alter function public.es_hoy_ar(timestamptz) set schema privado;
alter function public.set_comision_pct_default() set schema privado;
alter function public.recalcular_total_pedido() set schema privado;

-- Search path fijo, mismo motivo que en las otras funciones (aunque acá no
-- hay tablas de por medio, así queda uniforme y sin la advertencia del linter).
alter function privado.es_hoy_ar(timestamptz) set search_path = public;

-- Mismos privilegios que tenían en public: los necesitan authenticated/anon
-- para poder evaluar las RLS que las llaman (revocarlos rompería todas las
-- queries, no solo el acceso público directo).
grant usage on schema privado to anon, authenticated;
grant execute on all functions in schema privado to anon, authenticated;
