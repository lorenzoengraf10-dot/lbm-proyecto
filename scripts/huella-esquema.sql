-- Huella del esquema, para comparar la base de la nube contra lo que sale de
-- correr supabase/migrations/ de cero.
--
-- Por qué hace falta: las migraciones son el papel, pero lo que manda es lo
-- que está aplicado. Ya pasó una vez que una migración se escribió contra el
-- cuerpo equivocado de una función porque nadie miró lo que la base tenía de
-- verdad, y se agarró de casualidad. Esto lo convierte en un número.
--
-- Cómo se usa: correr esto en las dos bases y comparar el hash.
--
--   psql -d lbm_plantilla -Atf scripts/huella-esquema.sql
--   (y lo mismo contra la nube, desde el SQL Editor de Supabase)
--
-- Si dan distinto, cambiar la última línea por "select linea from f order by 1"
-- en las dos y diffear las salidas: ahí se ve exactamente qué objeto cambió.
--
-- Las funciones de extensiones quedan afuera a propósito: pgcrypto se instala
-- en public en un Postgres pelado y en el schema extensions en Supabase, así
-- que contarlas compararía dónde está instalada una extensión, no el esquema.
-- El texto de las funciones se compara ENTERO, comentarios incluidos: si dos
-- copias difieren solo en los comentarios, una de las dos se aplicó a mano
-- desde una copia distinta a la del repositorio, y eso es justo lo que hay que
-- ver antes de escribir la migración siguiente.
with f as (
  select 'POLICY ' || tablename || ' ' || policyname || ' ' || cmd
         || ' USING ' || coalesce(regexp_replace(qual, '\s+', ' ', 'g'), '-')
         || ' CHECK ' || coalesce(regexp_replace(with_check, '\s+', ' ', 'g'), '-') as linea
  from pg_policies where schemaname = 'public'

  union all
  select 'FUNC ' || n.nspname || '.' || p.proname || ' secdef=' || p.prosecdef || ' '
         || md5(regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g'))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'privado')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')

  union all
  select 'INDEX ' || indexname || ' ' || regexp_replace(indexdef, '\s+', ' ', 'g')
  from pg_indexes where schemaname = 'public'

  union all
  select 'CONSTRAINT ' || rel.relname || ' ' || con.conname || ' '
         || regexp_replace(pg_get_constraintdef(con.oid), '\s+', ' ', 'g')
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'

  union all
  select 'COL ' || table_name || '.' || column_name || ' ' || data_type || ' null=' || is_nullable
  from information_schema.columns where table_schema = 'public'
)
select count(*) || ' objetos · ' || md5(string_agg(linea, chr(10) order by linea)) as huella from f;
