# lbm-proyecto

App interna de pedidos y cobertura de ruta para La Buena Medida.

Ver [docs/PLAN.md](docs/PLAN.md) para el plan de desarrollo (stack, estructura y etapas).

## Estado

- **Etapa 1 — Modelo de datos y backend**: completa. Esquema, RLS por rol, scripts de siembra e importación.
- **Etapa 2 — Panel admin**: completa. Login, comercios (CRUD + importación CSV), productos (CRUD) y alta de cuentas.
- **Etapa 3 — QR**: completa. Cartel imprimible por comercio, individual y en hoja para toda la cartera.
- **Etapa 4 — App del vendedor**: completa. Página web (no app nativa, ver `docs/PLAN.md` sección 9): login + PIN de desbloqueo, listado de comercios con buscador, escaneo de QR, carga de pedido y último pedido del comercio como referencia.
- **Etapa 5 — Modo sin señal**: completa. El catálogo queda guardado en el celular y lo que el vendedor carga va a una cola local que se sube sola cuando vuelve la señal. Los identificadores se generan en el celular, así que reintentar no duplica nada.
- **Etapa 6 — Pedidos, comisiones y reportes**: completa. El panel tiene **Pedidos** (listado con filtros + detalle), **Comisiones** (total vendido y a pagar por vendedor, por rango), **Cobertura** (hace cuánto que nadie visita cada comercio) y el **Reporte semanal** con descarga en PDF.
- El vendedor puede además **corregir o anular** un pedido el mismo día que lo cargó; pasada esa ventana queda fijo, para no mover comisiones ya reportadas.
- El admin puede **ver el registro por mes y corregir cualquier pedido**, incluso viejo, desde su detalle — queda anotado quién, cuándo y por qué (`docs/PLAN.md` sección 13).
- **Estadísticas** (admin): qué comercios compran más, qué productos se venden más y cómo viene cada vendedor, por período. El vendedor tiene su versión personal en **Resumen** (`docs/PLAN.md` sección 14).
- **Carteles QR en PDF**: desde *Comercios → QR para imprimir*, un PDF con todos los carteles (QR + código + nombre), seis por hoja A4 en tamaño real, listo para llevar a una imprenta (`docs/PLAN.md` sección 15).
- **Estados del pedido y cobro**: cada pedido va de *Pedido* a *Preparado* a *Completado*, y al completarlo se registra si se cobró en efectivo, por transferencia o quedó debiendo. Lo que queda a cuenta se ve en la portada hasta que se marca cobrado. Tanto el dueño como el repartidor pueden marcarlo, y el repartidor también sin señal (`docs/PLAN.md` sección 17).
- **Comisión editable sin tocar el pasado**: el dueño cambia el porcentaje del repartidor desde su ficha; vale para los pedidos nuevos y los ya hechos quedan con el porcentaje que tenían, porque se congela dentro de cada pedido al crearlo. La comisión se gana con el pedido entregado.
- **Se entra con nombre y PIN**: tanto al panel como a la app del repartidor se entra tocando el nombre y escribiendo seis números. El dueño fija los PIN desde la ficha de cada usuario, incluido el suyo. Varios errores seguidos bloquean la cuenta (quince minutos en la app, una hora en el panel). El panel conserva "Entrar con contraseña" como respaldo, porque al dueño nadie le puede resetear el PIN (`docs/PLAN.md` sección 18).
- **Velocidad**: las dos apps se despliegan en São Paulo (`"regions": ["gru1"]`), al lado de la base, y las pantallas dejaron de encadenar consultas. El panel pasó de 4,6 s a 0,9 s para las siete pantallas principales (`docs/PLAN.md` sección 16).

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

Sin terminal: `supabase/esquema-completo.sql` es todo eso junto en un archivo
para pegar en el SQL Editor de Supabase. Lo genera `pnpm esquema` a partir de
las migraciones — no se edita a mano, y `pnpm revisar-esquema` avisa si quedó
viejo.

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
- **Todos, en PDF**: **Comercios → QR para imprimir → Descargar PDF**. Seis carteles por hoja A4 en tamaño real, con el QR, el código bien grande y el nombre abajo. Es lo más cómodo para llevar a una imprenta. `?incluir=todos` suma los comercios dados de baja.
- **Todos, desde el navegador**: la misma pantalla tiene el botón "Imprimir", que manda la hoja a la impresora de la máquina. Se recortan por la línea de puntos.

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
pnpm typecheck          # los cuatro paquetes
pnpm lint               # las dos apps
pnpm revisar-esquema    # esquema-completo.sql al día con las migraciones
pnpm --filter @lbm/admin run build
pnpm --filter @lbm/vendedor run build
```

## Cosas que se aprendieron a los golpes

Detalles que costaron un rato de depuración y conviene no volver a pisar:

- **Las columnas `numeric` de Postgres llegan como texto.** `total`, `precio`,
  `cantidad` y `comision_pct` vuelven de la API como `"6400.00"`, no como
  número, aunque los tipos generados digan `number`. Sumarlas con `+` sin
  convertir concatena texto y aparece un `$ NaN` en pantalla: siempre
  `Number(...)` antes de operar. `formatearPrecio` y `formatearCantidad` ya
  convierten solos.
- **`revoke ... from anon` no alcanza para cerrar una función.** El permiso de
  anon son dos cosas distintas: el que hereda de `PUBLIC` (Postgres se lo da a
  toda función nueva) y el explícito que agrega Supabase. Hay que revocar los
  dos.
- **Un `delete` bloqueado por RLS no da error**, devuelve cero filas. Si la
  pantalla no mira cuántas filas tocó, parece que anduvo.
- **En Vercel, el framework hay que fijarlo** (`vercel.json` con
  `{"framework": "nextjs"}`). Si el proyecto queda en "Other" el build no
  falla: despliega una carpeta vacía y da 404.
- **Y la región también.** Sin `"regions"` en el `vercel.json`, Vercel pone la
  función en Estados Unidos. Con la base en São Paulo, cada consulta paga unos
  120 ms de ida y vuelta; como cada pantalla hace cuatro viajes encadenados
  (tres de ellos de autenticación), son medio segundo de puro viaje antes de
  mostrar nada. `"regions": ["gru1"]` lo deja en unos pocos milisegundos.
- **El proxy no puede redirigir `/sw.js`.** Si lo manda al login, el service
  worker no se registra y la app deja de abrir sin señal — sin ningún error
  visible. Las exclusiones del `matcher` no sirven para esto; hay que cortar
  dentro de la función.
