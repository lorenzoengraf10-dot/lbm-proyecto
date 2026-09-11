# lbm-proyecto

App interna de pedidos y cobertura de ruta para La Buena Medida.

Ver [docs/PLAN.md](docs/PLAN.md) para el plan de desarrollo (stack, estructura y etapas).

## Estado

- **Etapa 1 — Modelo de datos y backend**: completa. Esquema, RLS por rol, scripts de siembra e importación.
- **Etapa 2 — Panel admin**: completa. Login, comercios (CRUD + importación CSV), productos (CRUD) y alta de cuentas.
- **Etapa 3 — QR**: completa. Cartel imprimible por comercio, individual y en hoja para toda la cartera.
- **Etapa 4 — App del vendedor**: completa. Página web (no app nativa, ver `docs/PLAN.md` sección 9): login + PIN de desbloqueo, listado de comercios con buscador, escaneo de QR, carga de pedido y último pedido del comercio como referencia.
- **Adelanto de etapa 6**: el panel admin ya tiene **Pedidos** (listado con filtros + detalle) y **Comisiones** (total vendido y a pagar por vendedor, por rango de fechas). Ver `docs/PLAN.md` sección 10.
- Falta el modo offline (etapa 5) y el reporte PDF semanal (resto de la etapa 6).

## Ecosistema cerrado

Solo entran las cuentas que crea el administrador desde el panel. Están apagadas todas las vías de registro (email, anónimo, SMS, Google y demás proveedores, web3, OAuth server), y aun si alguien lograra crear una cuenta suelta no vería absolutamente nada: las policies exigen un perfil activo en el sistema.

Esa configuración vive en `supabase/config.toml` y **no se aplica sola al proyecto de la nube**:

```bash
pnpm dlx supabase config push   # aplica la configuración cerrada
pnpm dlx supabase config diff   # comprueba que el proyecto real coincide
pnpm --filter @lbm/scripts run acceso   # lista quién puede entrar hoy
```

`acceso` avisa si aparece alguna cuenta que no debería existir.

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

### 4. App del vendedor

```bash
cp apps/vendedor/.env.example apps/vendedor/.env.local   # mismos datos del proyecto que el panel
pnpm --filter @lbm/vendedor run dev
```

Queda en http://localhost:3000 (o el puerto que esté libre). Entra con usuario y contraseña; solo los usuarios con rol `vendedor` tienen acceso. El primer ingreso en cada celular pide elegir un PIN de 4 dígitos para desbloquear rápido de ahí en más, sin repetir la contraseña real cada vez (ver `docs/PLAN.md` sección 9).

## Importar la cartera de comercios

Desde el panel: **Comercios → Importar desde CSV**. Muestra una previsualización con las filas válidas y las que se saltean antes de confirmar.

También existe la versión de línea de comandos, útil para la carga inicial grande:

```bash
pnpm --filter @lbm/scripts run import:comercios -- ./mi-archivo.csv --dry-run
pnpm --filter @lbm/scripts run import:comercios -- ./mi-archivo.csv
```

El CSV necesita las columnas `codigo,nombre,localidad`. Los códigos se guardan en mayúsculas y la importación es segura de repetir: actualiza por `codigo` en vez de duplicar (y no reactiva comercios dados de baja).

`scripts/comercios-cp.csv` ya trae CP1 a CP100 con nombres provisorios (`Comercio CP1`, etc.) para poder arrancar: se importa una vez y después cada nombre se corrige desde el panel a medida que se confirman.

## QR de los comercios

Cada comercio tiene su cartel de 7×9 cm con el QR, el código y el nombre:

- **Uno solo**: desde la ficha del comercio, "Descargar para imprimir" (SVG, se imprime nítido a cualquier tamaño).
- **Todos**: **Comercios → QR para imprimir** arma una hoja con los carteles de todos los comercios activos y se manda a la impresora con el botón "Imprimir". Se recortan por la línea de puntos.

El QR guarda `LBM:<código>` como texto plano. No es un link: si alguien lo escanea con la cámara del celular no lo lleva a ningún lado, solo la app del vendedor lo entiende.

## Estructura

```
apps/admin/       Panel de administración (Next.js)
apps/vendedor/    App del vendedor: visitas y pedidos (Next.js)
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
pnpm --filter @lbm/vendedor run lint
pnpm --filter @lbm/vendedor run build
```
