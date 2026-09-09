# lbm-proyecto

App interna de pedidos y cobertura de ruta para La Buena Medida.

Ver [docs/PLAN.md](docs/PLAN.md) para el plan de desarrollo (stack, estructura y etapas).

## Estado

- **Etapa 1 — Modelo de datos y backend**: completa. Esquema, RLS por rol, scripts de siembra e importación.
- **Etapa 2 — Panel admin**: completa. Login, comercios (CRUD + importación CSV), productos (CRUD) y alta de vendedores.
- Todavía no hay app del vendedor (etapa 4), generación de QR (etapa 3) ni reportes (etapa 6).

## Requisitos

- Node.js 22+
- pnpm (`corepack enable` o `npm i -g pnpm`)
- Una cuenta y proyecto en [Supabase](https://supabase.com)

## Puesta en marcha

```bash
pnpm install
```

### 1. Base de datos

El esquema vive como migraciones versionadas en `supabase/migrations/`:

```bash
pnpm dlx supabase link --project-ref <tu-project-ref>
pnpm dlx supabase db push
```

En el dashboard de Supabase hay que **desactivar el registro público** (Authentication → Sign In / Providers → deshabilitar "Allow new users to sign up"). Las cuentas las crea el admin desde el panel; `supabase/config.toml` ya lo deja apagado para el entorno local.

`supabase/seed.sql` tiene comercios y productos de ejemplo (solo para desarrollo). La configuración que la app necesita para funcionar —tasa de comisión, largo del PIN— se carga sola con las migraciones.

### 2. Primer administrador

El panel no permite crear el primer admin (las policies exigen ser admin para dar de alta usuarios), así que esa cuenta se siembra con la service role key:

```bash
cp .env.example .env   # completar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
pnpm --filter @lbm/scripts run seed:usuarios
```

Crea `admin` más dos vendedores de prueba, e imprime las contraseñas. **Cambiarlas antes de usar el sistema de verdad.**

### 3. Panel de administración

```bash
cp apps/admin/.env.example apps/admin/.env.local   # completar con los datos del proyecto
pnpm --filter @lbm/admin run dev
```

Queda en http://localhost:3000. Entra con usuario y contraseña; solo los usuarios con rol `admin` tienen acceso.

## Importar la cartera de comercios

Desde el panel: **Comercios → Importar desde CSV**. Muestra una previsualización con las filas válidas y las que se saltean antes de confirmar.

También existe la versión de línea de comandos, útil para la carga inicial grande:

```bash
pnpm --filter @lbm/scripts run import:comercios -- ./mi-archivo.csv --dry-run
pnpm --filter @lbm/scripts run import:comercios -- ./mi-archivo.csv
```

El CSV necesita las columnas `codigo,nombre,localidad`. Los códigos se guardan en mayúsculas y la importación es segura de repetir: actualiza por `codigo` en vez de duplicar (y no reactiva comercios dados de baja).

## Estructura

```
apps/admin/       Panel de administración (Next.js)
packages/shared/  Tipos del dominio, validaciones y parseo de CSV compartidos
scripts/          Siembra de usuarios e importación masiva de comercios
supabase/         Migraciones SQL, seed y configuración del proyecto
docs/PLAN.md      Plan de desarrollo y decisiones tomadas
```

## Chequeos

```bash
pnpm -r run typecheck
pnpm --filter @lbm/admin run lint
pnpm --filter @lbm/admin run build
```
