# lbm-proyecto

App interna de pedidos y cobertura de ruta para La Buena Medida.

Ver [docs/PLAN.md](docs/PLAN.md) para el plan de desarrollo (stack, estructura y etapas).

## Estado

Etapa 1 completa: modelo de datos, RLS y scripts de siembra/importación. Todavía no hay panel admin ni app de vendedor (etapas 2 en adelante).

## Requisitos

- Node.js 22+
- pnpm (`corepack enable` o `npm i -g pnpm`)
- Una cuenta y proyecto en [Supabase](https://supabase.com)

## Configuración

```bash
pnpm install
cp .env.example .env   # completar con los datos del proyecto Supabase (Project Settings > API)
```

## Base de datos (Supabase)

El esquema vive como migraciones versionadas en `supabase/migrations/`. Para aplicarlo a un proyecto Supabase real:

```bash
pnpm dlx supabase link --project-ref <tu-project-ref>
pnpm dlx supabase db push
```

Esto corre las migraciones y, en un `db reset` local, también `supabase/seed.sql` (comercios/productos/configuración de ejemplo). En un proyecto ya creado, `seed.sql` no se aplica automáticamente con `db push` — se puede correr a mano desde el SQL Editor de Supabase si hace falta.

## Scripts (`scripts/`)

Con `.env` ya configurado:

```bash
# Alta de admin + vendedores de prueba (usa el Admin API, no SQL directo)
pnpm --filter @lbm/scripts run seed:usuarios

# Importación de comercios desde CSV (columnas: codigo,nombre,localidad)
pnpm --filter @lbm/scripts run import:comercios -- ./mi-archivo.csv --dry-run
pnpm --filter @lbm/scripts run import:comercios -- ./mi-archivo.csv
```

`--dry-run` valida y muestra las filas sin escribir nada en la base — usarlo siempre primero con un CSV nuevo. La importación es segura de repetir: hace upsert por `codigo`.

## Estructura

Ver la sección 4 de [docs/PLAN.md](docs/PLAN.md).
