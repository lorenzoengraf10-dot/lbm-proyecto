# Plan de Desarrollo — La Buena Medida (LBM)

> **Estado: etapas 1, 2, 3 y 4 completas**, más una parte de la 6 (ver pedidos y comisiones) adelantada. El plan de abajo quedó confirmado; las secciones 2 y 2.1 documentan las decisiones que se tomaron sobre los puntos ambiguos. La sección 6 anota las correcciones que salieron de la revisión de las dos primeras etapas. La sección 9 documenta un cambio de stack sobre lo acordado en la sección 3: la app del vendedor terminó siendo una página web, no una app nativa (React Native/Expo). La sección 10 tiene un bug importante para tener en cuenta en cualquier código nuevo que sume columnas `numeric`.

## 1. Resumen del entendimiento

- **Objetivo principal**: apoyar la venta cara a cara (vendedor visita al comercio, muestra catálogo, carga el pedido en el momento). La trazabilidad de ventas/comisiones es el objetivo secundario.
- **2 roles**: `admin` (visibilidad total, administra catálogo y cartera, genera QR, genera reporte PDF semanal, no carga pedidos) y `vendedor` (ve todos los comercios sin ruta fija, escanea QR para registrar visita, opcionalmente carga pedido, ve el último pedido del comercio).
- **Entidades**: Usuario, Comercio (con QR único), Producto (catálogo chico, 15-20 ítems, sin categorías), Visita (siempre se registra al escanear, con o sin pedido), Pedido (1 a 1 con Visita, ítems con precio congelado al momento de la venta).
- **Offline-first** para la app del vendedor (zonas con señal débil como Villalonga): escanear y cargar pedido sin conexión, sincronizar después sin duplicar ni perder datos.
- **Reporte semanal en PDF**: ventas por vendedor, por producto, cobertura de visitas (comercios visitados vs. cartera activa, con listado de no visitados), total facturado, comisión por vendedor (3% configurable).
- **Importación inicial** de comercios vía CSV/JSON; después el alta/edición/baja es manual desde el panel admin.
- **Fuera de alcance** (confirmado, no se construye): facturación/AFIP, login para comercios clientes, pasarela de pagos, ruteo GPS/optimización de recorridos.

## 2. Ambigüedades detectadas y resolución propuesta

El documento original delega en mí varias decisiones de stack, y dejó algunos puntos de comportamiento sin especificar. Los marco acá con la resolución que voy a asumir si no hay objeción:

| # | Punto ambiguo | Resolución propuesta |
|---|---|---|
| 1 | Mecanismo de login (no se especifica) | Vendedor: usuario + **PIN numérico de 4 dígitos** (pensado para uso rápido a diario desde el celular). Admin: usuario + contraseña normal (panel de escritorio, datos más sensibles). Ambos vía Supabase Auth; el admin crea las cuentas (sin auto-registro público). |
| 2 | ¿Se puede editar/anular un pedido ya cargado? | Sí, pero solo el mismo día de la carga. Pasado ese plazo queda fijo, para no romper la trazabilidad de comisiones ya calculadas/reportadas. |
| 3 | ¿Cuentan varias visitas al mismo comercio en la misma semana? | Se registra cada escaneo como visita independiente (sin límite). Para "cobertura semanal" alcanza con ≥1 visita esa semana. |
| 4 | Baja de vendedores (no mencionado explícitamente, sí para comercios/productos) | Mismo patrón: campo `activo`, nunca se borra (mantiene histórico de ventas/comisiones). |
| 5 | Comisión "hoy 3% fijo, pero puede variar por vendedor a futuro" | Se guarda el % de comisión en cada vendedor, con default = constante global configurable. Así el día de mañana se ajusta por persona sin migrar el modelo. |
| 6 | Definición de "semana" para reportes/cobertura | Semana calendario lunes a domingo, huso horario `America/Argentina/Buenos_Aires`. |
| 7 | Contenido del QR | Texto plano con el código del comercio y un prefijo propio (`LBM:CP1`), no una URL pública — así el QR no sirve de nada fuera de la app, y el prefijo permite descartar de una cualquier otro código que le llegue a la cámara. |
| 8 | Multi-dispositivo por vendedor | Permitido sin restricción; no hay pairing de dispositivo único por usuario. |

Si alguno de estos no es lo que se espera, se ajusta antes de tocar el modelo de datos (etapa 1).

### 2.1 Detalle — PIN propio y privado por vendedor

Sobre el punto 1: el vendedor usa un **PIN de 4 dígitos** para el uso diario (más rápido de tipear a diario, en la calle, desde el celular). El admin mantiene usuario + contraseña normal, por acceder desde escritorio y manejar datos más sensibles (ventas totales, comisiones).

> **Ajuste técnico (etapa 1)**: Supabase Auth exige contraseñas de al menos 6 caracteres — es un piso fijo de la plataforma, no se puede bajar. Un PIN de 4 dígitos no puede ser directamente esa contraseña. La solución es igual de simple para el vendedor y en realidad más segura: el PIN nunca viaja a ningún servidor, es solo la llave para desbloquear localmente una sesión que ya inició con la credencial real.

- **Credencial real vs. PIN de desbloqueo**: cada vendedor tiene una credencial real (≥6 caracteres, generada al crear la cuenta) que autentica contra Supabase, pero la usa una sola vez, al configurar su celular. El PIN de 4 dígitos que elige después es una llave que se guarda solo en ESE dispositivo (hasheada, en almacenamiento seguro del celular) para desbloquear la sesión ya iniciada, sin volver a escribir la credencial real.
- **Por qué sigue siendo "secreto"**: la credencial real la guarda Supabase Auth hasheada (nadie la puede leer, ni el admin ni quien programe la app); el PIN lo guarda el propio celular hasheado (nadie fuera de ese dispositivo lo puede leer). En ningún punto queda una contraseña en texto plano.
- **Usuario en vez de email**: el login pide "Usuario" (ej. `juan`), no email. Por debajo se mapea a un email técnico invisible para Supabase.
- **Alta**: el admin crea la cuenta del vendedor con una credencial real temporal (≥6 caracteres). Se la entrega en persona o por WhatsApp (equipo chico, de confianza).
- **Primer login en el celular**: se usa la credencial real temporal UNA sola vez. Ahí mismo, la app pide elegir un PIN de 4 dígitos y guarda la sesión de forma segura en el dispositivo.
- **Uso diario, pensado para funcionar offline**: de ahí en más, la app solo pide el PIN para desbloquear — lo valida localmente (sin necesitar señal) y reutiliza la sesión ya guardada. Funciona como una pantalla de bloqueo rápida.
- **Bloqueo por intentos fallidos**: después de 5 PIN incorrectos seguidos, la app borra la sesión local y exige repetir el login completo con la credencial real. Esto evita que alguien con el celular en mano pruebe las 10.000 combinaciones sin límite.
- **Multi-dispositivo**: cada celular nuevo repite el login completo con la credencial real una vez, y define su propio PIN local (puede ser igual o distinto en cada equipo).
- **Si olvida el PIN**: como la credencial real no se expone al vendedor en el día a día, el admin la resetea desde el panel y se repite el "primer login" en el celular nuevo.
- **Dónde se implementa cada parte**: la credencial real y las cuentas son etapa 1 (backend, ya resuelto en las migraciones). El PIN local, su hash y el bloqueo por intentos son etapa 4/5 (app del vendedor), porque viven enteramente en el celular.
- **Configurable**: el largo del PIN (4 dígitos) queda como constante, igual que la tasa de comisión, por si más adelante se quiere pasar a 6 dígitos.

## 3. Stack propuesto

Para un equipo de 1 desarrollador y un negocio familiar chico, prioridad = mínimo mantenimiento operativo, no sofisticación.

| Capa | Elección | Por qué |
|---|---|---|
| Backend + DB | **Supabase** (Postgres + Auth + Storage + Row Level Security + Edge Functions) | Cero infraestructura propia que mantener, tier gratuito generoso, auth con roles ya integrado, esquema SQL versionable, y permite correr la generación de PDF/QR en lote como Edge Function sin un servidor aparte. |
| Panel admin | **Next.js + TypeScript + Tailwind**, deploy en **Vercel** | Encaja natural con Supabase (mismo cliente JS), SSR para el dashboard, deploy con un push. |
| App vendedor | **React Native con Expo (TypeScript)** | Comparte lenguaje y tipos con el panel admin (un solo `packages/shared` para `Producto`, `Comercio`, `Pedido`, tasa de comisión, etc.). Expo simplifica cámara/escaneo QR y el build (EAS) sin depender de Android Studio, y deja abierta la puerta a iOS sin reescribir nada. |
| Offline local | **SQLite embebido (expo-sqlite)** + cola de sincronización propia | IDs generados en el cliente (UUID) desde el momento de la visita/pedido → los reintentos de sync son idempotentes (upsert por ID), sin duplicar ni perder datos aunque se corte la conexión a mitad de sync. |
| QR | Librería `qrcode` (Node), corrida en una Edge Function / API route | Generación on-demand, descarga individual o en lote (ZIP) desde el panel admin. Sin servicio externo pago. |
| PDF | `@react-pdf/renderer` (o Puppeteer) en una Edge Function / API route | Genera el PDF semanal on-demand al pedirlo desde el panel, filtrando por semana. |
| Monorepo | **pnpm workspaces** | Un solo repo, tipos y constantes compartidos entre admin y vendedor, sin duplicar lógica de dominio. |

## 4. Estructura de carpetas propuesta

```
lbm-proyecto/
├── apps/
│   ├── admin/              # Next.js — panel administrador
│   └── vendedor/           # Expo/React Native — app del vendedor
├── packages/
│   └── shared/             # tipos TS, constantes (TASA_COMISION_DEFAULT), utils comunes
├── supabase/
│   ├── migrations/         # esquema SQL versionado
│   ├── seed.sql            # datos de prueba (comercios, productos, configuración)
│   └── functions/          # Edge Functions: generación de PDF, export de QR en lote
├── scripts/
│   ├── import-comercios.ts # importación masiva inicial de comercios (CSV)
│   └── seed-usuarios.ts    # alta de admin + vendedores de prueba (usa el Admin API, no SQL)
├── docs/
│   └── PLAN.md             # este documento
├── package.json            # root, workspaces
└── pnpm-workspace.yaml
```

## 5. Plan de etapas

1. ✅ **Modelo de datos + backend básico** — esquema SQL en Supabase (usuarios/roles, comercios, productos, visitas, pedidos, pedido_items, configuración de comisión), Row Level Security (admin ve todo; vendedor solo lee catálogo/cartera y escribe lo propio), seed de prueba (`supabase/seed.sql` + `scripts/seed-usuarios.ts`), script de importación CSV de comercios.
2. ✅ **Panel admin — catálogo, comercios y vendedores** — login admin, CRUD de productos (alta/edición/baja/precio), CRUD de comercios (alta/edición/baja) + pantalla de importación CSV inicial, y alta de cuentas de vendedores (no estaba explícito en el documento original, pero lo requiere el mecanismo de login ya confirmado — alguien tiene que poder crear esas cuentas desde algún lado).
3. ✅ **Generación e impresión de QR** — QR por comercio a partir de su código, con vista previa y descarga individual (SVG) desde la ficha, y una hoja de todos los comercios activos lista para imprimir. En vez del ZIP que se había planteado, la salida en lote es esa hoja imprimible: para pegar 100 carteles conviene mandarlos a la impresora de una que bajar 100 archivos sueltos. Si igual hacen falta los archivos, agregar el ZIP es un rato.
4. ✅ **App del vendedor — escaneo y pedido (con conexión)** — login vendedor, listado de comercios con buscador, escaneo de QR → crea Visita, catálogo interactivo → carga Pedido asociado, ver último pedido del comercio como referencia. Terminó siendo una página web (ver sección 9), no la app nativa que planteaba la sección 3 originalmente.
5. ✅ **Modo offline** — persistencia local de visitas/pedidos, cola de sincronización con IDs idempotentes, reintento automático al recuperar señal, indicador de "pendiente de sincronizar". Sobre IndexedDB y no SQLite, porque la app terminó siendo web (sección 9).
6. ✅ **Dashboard + Reporte PDF semanal** — portada con las ventas del día y de la semana, ranking de productos, cobertura de visitas, y PDF semanal con selector de semana (ventas por vendedor/producto, cobertura, comisión 3%). Ver secciones 10 a 12.

Cada etapa es funcional de punta a punta antes de pasar a la siguiente.

## 6. Correcciones de la revisión (etapas 1 y 2)

Cosas que se arreglaron al revisar las dos primeras etapas juntas. Las migraciones se editaron en el lugar porque todavía no hay ningún proyecto Supabase con el esquema aplicado; una vez que lo haya, cualquier cambio de esquema tiene que ir en una migración nueva.

**Seguridad (RLS)**

- `rol_actual()` ahora ignora a los usuarios dados de baja (`... and activo`). Antes, un vendedor desactivado seguía pudiendo leer la cartera y cargar visitas y pedidos: la baja solo lo frenaba en el panel.
- Ninguna policy se conforma con "estar logueado". Antes, `comercios` y `productos` se leían con solo `activo = true`, así que cualquier cuenta autenticada del proyecto veía toda la cartera de clientes. Ahora todas exigen un usuario activo del negocio.
- Se apagó el registro público en `supabase/config.toml` (`enable_signup = false`), que viene prendido por defecto. Hay que apagarlo también en el dashboard del proyecto real.
- La ventana de edición de pedidos ("mismo día") y la visibilidad cruzada entre vendedores se verificaron con casos concretos contra un Postgres local.
- `rol_actual`, `es_hoy_ar`, `set_comision_pct_default` y `recalcular_total_pedido` se movieron del schema `public` a uno nuevo, `privado` (migración `20260910000001`). PostgREST expone toda función de `public` como endpoint RPC público; el linter de seguridad de Supabase marcaba que `anon`/`authenticated` podían ejecutarlas directo vía `/rest/v1/rpc/...`. No están pensadas para llamarse desde afuera, solo las usan las RLS y los triggers — mover el schema no rompe nada (las policies referencian la función por OID, no por nombre) y saca el endpoint. Validado contra Postgres local antes de aplicarlo al proyecto real.

**Modelo de datos**

- `usuarios.comision_pct` y `pedido_items.subtotal` pasaron a `not null`: el trigger y la columna generada siempre los completan, y dejarlos nulos obligaba a manejar un caso que no puede pasar.
- Las filas de `configuracion` se movieron de `seed.sql` a una migración: la app las necesita para funcionar (el alta de un vendedor falla sin `tasa_comision_default`), así que no son datos de ejemplo.
- `productos.nombre` es único sin distinguir mayúsculas. En un catálogo de 15-20 ítems dos productos con el mismo nombre son un error de carga, y el vendedor no podría distinguirlos en la app.

**Panel**

- Cada server action valida que quien la llama sea admin. No alcanza con el guard del layout: las actions son endpoints HTTP propios y se pueden llamar directo.
- El proxy copia las cookies renovadas cuando además redirige. Sin eso, si el token se renovaba justo en un request que redirigía, el refresh token rotado se perdía y la sesión se caía sola.
- La validación del CSV se hace de nuevo en el servidor al confirmar la importación, en vez de confiar en lo que muestra la previsualización.
- El formulario de alta queda abierto y limpio después de guardar, con el aviso a la vista, para poder cargar varios seguidos.

## 7. Despliegue

Panel admin en Vercel (proyecto `pedido.lbm`, conectado al repo por GitHub, deploys automáticos en cada push a `main`), Root Directory `apps/admin`. Variables de entorno cargadas en el dashboard de Vercel, con los nombres exactos que lee `apps/admin/src/lib/env.ts`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ahí adentro se puede pegar tanto la clave legacy como la nueva `sb_publishable_...`, son intercambiables) y `SUPABASE_SERVICE_ROLE_KEY`.

Los primeros deployments daban 404 (terminaban en "Ready" a los 2 segundos, sin build real): el proyecto se había creado antes de fijar el Root Directory, así que Vercel nunca detectó Next.js y el framework quedó pisado en "Other" a nivel del deployment de producción — aunque el Project Settings del dashboard ya decía "Next.js", el deployment activo seguía usando esa config vieja. Se agregó `apps/admin/vercel.json` con `"framework": "nextjs"` explícito para que no dependa de lo que haya guardado el dashboard.

## 8. Cuentas: contraseña propia y eliminar de verdad

Dos cosas que se agregaron después de tener el panel funcionando, a pedido del uso real:

- **Cambiar mi contraseña**: la pantalla de un usuario ya tenía "Generar credencial nueva" (para vendedores, o para resetear a otra persona), pero esa siempre arma una al azar — no dejaba elegir una propia. Para la propia cuenta (`esUnoMismo` en `/usuarios/[id]`) ahora se muestra en cambio un formulario para elegir la contraseña, vía `supabase.auth.updateUser()` con la sesión propia (no hace falta la service role: esa llamada solo puede tocar la cuenta de quien está logueado).
- **Eliminar, no solo dar de baja**: `usuarios`, `comercios` y `productos` no tenían ninguna policy RLS `for delete` (un intento de borrado quedaba bloqueado en silencio, 0 filas). Se agregaron policies `*_delete_admin` (migración `20260910000002`). El borrado en sí solo tiene éxito si la fila nunca tuvo `visitas`/`pedidos`/`pedido_items` — esas tablas no tienen `on delete cascade` hacia acá a propósito, para no perder histórico de comisiones. La UI chequea eso antes de intentarlo y muestra un mensaje claro ("dalo de baja en su lugar") en vez de un error de base cruda. Para usuarios, el borrado pasa por `admin.auth.admin.deleteUser()` (service role) para que también desaparezca la cuenta de Supabase Auth, no solo el perfil.

## 9. Etapa 4 — app del vendedor: web en vez de nativa

La sección 3 proponía React Native + Expo para esta etapa, pensando en el modo offline (etapa 5) con SQLite embebido. Se cambió a una segunda app Next.js (`apps/vendedor`), por lo que costó poner online *solo el panel de admin* (sección 7): agregar encima toda una app nativa — cuentas de desarrollador, build con EAS, instalación en el celular — iba a multiplicar esa fricción, para una herramienta interna de dos personas. Con esto:

- El repartidor abre una URL desde el navegador del celular (Chrome/Safari) y puede "agregar a pantalla de inicio" para que quede como un ícono. Nada que instalar ni aprobar en ninguna tienda.
- Reutiliza el mismo stack ya probado (Next.js + Supabase + Vercel) en vez de sumar un toolchain nuevo (Expo/React Native) para dos personas.
- El modo offline de la etapa 5 se resuelve más adelante con Service Worker + IndexedDB (mismo patrón de cola con IDs generados en el cliente que ya preveía la sección 3, solo que sobre APIs web en vez de SQLite nativo) — la etapa 4 en sí es "con conexión", así que no hacía falta resolver eso todavía.

**PIN de desbloqueo (sección 2.1) adaptado al navegador**: el diseño original pensaba en `expo-secure-store` (Keychain/Keystore nativo). En un navegador no existe ese almacenamiento seguro de hardware, así que se adaptó así:
- `localStorage` guarda `{hash, salt}` del PIN (SHA-256 vía Web Crypto, salt propio por dispositivo) — persiste entre sesiones, es lo que hace que el PIN "quede guardado en este celular".
- `sessionStorage` guarda si esta pestaña/apertura ya se desbloqueó — se pierde al cerrar la app, por eso pide el PIN de nuevo cada vez que se vuelve a abrir, igual que una pantalla de bloqueo.
- El PIN nunca se valida contra el servidor: es 100% local, funciona sin señal. La sesión real de Supabase (cookies) es aparte y es lo único que habilita de verdad el acceso a los datos — `requerirVendedor()` la exige siempre, tenga PIN configurado o no.
- 5 intentos fallidos (o "¿Olvidaste el PIN?") borran el PIN local y cierran la sesión real: hay que repetir el login completo con la credencial que solo tiene el admin. Ver `apps/vendedor/src/lib/pin.ts` y `src/components/candado-pin.tsx`.

**`crear_pedido`, una función de base en vez de dos inserts sueltos**: cargar un pedido son dos pasos (`pedidos` + `pedido_items`) que tienen que quedar los dos o ninguno — dos llamadas sueltas desde el cliente podían dejar un pedido sin ítems a mitad de camino. Se resolvió con una función Postgres (`supabase/migrations/20260910000003_funcion_crear_pedido.sql`) `security invoker` (no `definer`): corre con los permisos de quien la llama, así que sigue pasando por las mismas RLS de siempre — no es una puerta trasera, solo junta los dos inserts en una transacción. El precio de cada ítem se toma del catálogo en ese momento, nunca del cliente. A diferencia de `rol_actual()` y las otras funciones internas, esta sí se llama desde el cliente (`supabase.rpc('crear_pedido', ...)`), así que se deja pública a propósito.

**Validado con un servidor Postgres+Auth de prueba** (el mismo enfoque que ya se había usado para el panel): login, primer PIN, bloqueo por pestaña nueva, 5 intentos fallidos, alta de visita manual, catálogo, carga de pedido vía `crear_pedido` y que el pedido recién cargado aparezca como "último pedido" — 17/17 casos, sin errores de consola.

## 10. Panel: ver pedidos y comisiones (adelanto de la etapa 6)

Con la app del vendedor ya cargando pedidos de verdad, el admin pidió poder verlos antes de llegar a la etapa 6 (dashboard + PDF semanal) propiamente dicha. Se agregaron dos secciones al panel:

- **Pedidos** (`/pedidos`): todos los pedidos, con filtro por vendedor y por rango de fechas. `/pedidos/[id]` muestra el detalle (ítems, cantidades, precio unitario, subtotal).
- **Comisiones** (`/comisiones`): por vendedor, cantidad de pedidos + total vendido + comisión a pagar (`total × comision_pct / 100`) en el rango de fechas elegido (sin filtro = todo el historial). Pensada para que el admin sepa cuánto pagarle a cada repartidor.

Ninguna de las dos necesitó cambios de esquema ni de RLS: `pedidos_select`/`pedido_items_select` ya le dan al admin visibilidad total desde la etapa 1.

**Bug real encontrado al probar** (no cosmético — daba `$ NaN`): `pedidos.total`, `usuarios.comision_pct` y el resto de las columnas `numeric` de Postgres llegan del lado del cliente como **string** (`"6400.00"`), no como number, para no perder precisión — esto vale tanto para el mock de prueba como para Supabase real. `+` en JS concatena texto en cuanto un operando es string en vez de sumar (`0 + "6400.00"` da `"06400.00"`, no `6400`), así que sumar esas columnas con un `reduce`/`+=` sin pasarlas por `Number(...)` primero rompe en silencio y termina en `NaN`. `*` y `/` sí convierten solos, por eso no hizo falta tocar el cálculo del total del pedido en la app del vendedor (ahí la multiplicación pasa antes que cualquier suma). Regla para código futuro (el reporte PDF de la etapa 6 va a sumar exactamente estas mismas columnas): **toda columna `numeric` que se vaya a sumar con `+`/`reduce` se convierte con `Number(...)` primero** — formatearla con `Intl.NumberFormat` sola (sin sumar) es seguro tal cual, el problema es específico de `+`.

## 11. Etapas 5 y 6, y la pasada de UX

Cinco mejoras seguidas, en orden, sobre lo que ya funcionaba en la calle:

1. **Corregir o anular un pedido el mismo día** (vendedor). Al escribirlo apareció que la policy de `pedido_items` para insertar no exigía que el pedido fuera de hoy: se podían agregar ítems a un pedido viejo. Corregido en `20260911000001_editar_pedido.sql`, junto con la función `actualizar_pedido`.
2. **Cobertura** (admin). Vista `cobertura_comercios` con la última visita y el total de visitas por comercio, y una pantalla que los ordena por hace cuánto que nadie los visita. Como no hay ruta fija, esta es la forma de que ninguno quede en el olvido.
3. **Modo sin señal** (etapa 5). El catálogo va a IndexedDB y todo lo que el vendedor carga pasa primero por una cola local: un solo camino para con señal y sin señal, en vez de un "modo offline" aparte que se prueba poco. Los UUID se generan en el celular y `sincronizar_pedido` es idempotente, así que reintentar cien veces la misma fila no duplica nada.
4. **Reporte semanal en PDF** (etapa 6). `lib/reporte-semanal.ts` es la única fuente de los números, para que la pantalla y el PDF no puedan discrepar. El PDF se arma con pdf-lib (JS puro, sin binarios ni archivos de fuentes que leer del disco, así que funciona igual en la función serverless de Vercel).
5. **Pasada de UX del panel.** El panel estaba pensado para la compu y en el celular las tablas se salían de la pantalla. El componente `Tabla` rinde una tabla de verdad en la compu y una lista de tarjetas en el celular desde la misma definición de columnas. Además: portada con los números del día en vez de un redirect a `/comercios`, barra de navegación que se arrastra de costado en el celular, y `loading.tsx` en cada sección.

## 12. Correcciones de la revisión (etapas 5 y 6)

Lo que apareció al revisar todo lo construido de punta a punta.

**Las funciones RPC eran ejecutables sin sesión.** La migración 3 hacía `revoke execute ... from anon` y no servía; la 4, escrita para corregirla, hacía `revoke ... from public` y tampoco alcanzó. El permiso de anon sobre una función son **dos cosas distintas**: el que hereda de `PUBLIC` (Postgres se lo da de fábrica a toda función nueva) y el explícito que agrega Supabase con sus `alter default privileges`. Revocar uno deja el otro. Hay que revocar los dos.

Esto no se veía en las pruebas locales porque el stub del schema `auth` daba **menos** permisos que la nube: no replicaba los `grant execute on functions` de Supabase, así que una revocación incompleta pasaba igual. La lección general: un entorno de prueba más restrictivo que el real esconde justo los agujeros que importan.

**El vendedor recibía un "Pedido cargado." falso.** `registrarPendiente` no devolvía nada y `sincronizar` se tragaba el error del servidor anotándolo en la cola. Si el comercio estaba dado de baja, el repartidor se iba creyendo que el pedido había entrado. Ahora la función informa qué pasó con esa carga y la pantalla muestra el motivo. Detalle que costó una vuelta: en el camino del rechazo **no** hay que refrescar el catálogo, porque si el rechazo fue justamente porque dieron de baja el comercio, refrescarlo lo saca de la lista, desmonta la pantalla y el motivo se pierde en el momento en que hace falta leerlo.

**Publicar una versión nueva rompía la app abierta.** Los pedazos de código cambian de nombre en cada publicación y los viejos dejan de existir: la siguiente pantalla fallaba con "This page couldn't load". Ahora la app detecta ese error, limpia el caché del service worker y se recarga sola una vez, con una marca en `sessionStorage` para no quedar en loop.

**`on conflict (id)` no cubría `visita_id`.** `pedidos` tiene dos restricciones únicas y el `do nothing` apuntado solo cubría la clave primaria, así que un choque por `visita_id` levantaba un error de unicidad crudo en vez de no hacer nada. Sin objetivo, cubre las dos.

**El `.in()` del reporte semanal no escalaba.** PostgREST manda el filtro en la URL y un id son ~37 caracteres: una semana de varios cientos de pedidos armaba una URL de decenas de kB que el servidor rechaza. Va de a tandas de 200.

**`esquema-completo.sql` estaba cuatro migraciones atrás.** Es el archivo que se pega en el SQL Editor para levantar un proyecto nuevo sin terminal, y estaba escrito a mano: pegarlo dejaba la base sin la vista de cobertura ni las funciones de pedidos. Ahora lo genera `scripts/armar-esquema.mjs`, y `pnpm revisar-esquema` avisa si quedó viejo.

**Cosas menores:** el PIN repetido que no coincidía volvía al primer paso sin decir nada; `formatearPrecio` no aceptaba string en la app del vendedor; `comisionPct` se leía en cada request y no lo usaba nadie.

### Lo que quedó sin tocar a propósito

- **La visita se registra cuando el vendedor confirma**, no al escanear el QR. La sección 1 decía "siempre que escanea", pero escanear y que quede registrado sin querer (un escaneo de prueba, un QR leído dos veces) ensuciaría la cobertura. La pantalla del comercio pide confirmar con "Cargar pedido" o "Registrar visita sin pedido".
- **`sincronizar_pedido` sigue siendo ejecutable por cualquier usuario logueado**, y el linter de Supabase lo marca. Es a propósito: el vendedor la necesita, y la función valida ella misma el rol y la pertenencia. Lo que no corresponde —y ya está cerrado— es que la pudiera llamar alguien sin sesión.

## 13. El admin puede corregir un pedido viejo

La sección 12 dejaba anotado que un pedido mal cargado, detectado después del día en que se hizo, no tenía arreglo desde la app (los pedidos quedan fijos a propósito, para no mover comisiones ya reportadas). El dueño pidió poder verlo por mes y corregirlo cuando haga falta, así que se agregó eso puntualmente, sin tocar la regla del mismo día para el vendedor:

- **`/pedidos` tiene un selector de mes** que arma el rango de fechas solo (pisa cualquier Desde/Hasta escrito a mano): elegís "septiembre de 2026" y ves el registro completo de ese mes.
- **El detalle del pedido tiene un "Corregir este pedido"** (colapsado, como el alta de comercios/productos) con todo el catálogo — activo o dado de baja, porque un pedido viejo puede tener un producto que ya no se vende — y un campo de cantidad y de precio por producto. El precio no se toma del catálogo de hoy: viene tal cual del formulario, para no re-cotizar en silencio el resto de los ítems si algún precio cambió desde entonces.
- **Corregir exige un motivo** de una línea, y queda visible en el pedido ("Corregido por Lorenzo Engraf el 11/09/2026 — motivo: ...") y marcado con una etiqueta en el listado. No es un historial completo con versiones anteriores — eso sería para más adelante si hace falta — pero sí queda un rastro de que se tocó, quién y por qué.
- Técnicamente es una función nueva (`corregir_pedido_admin`), `security definer` como `sincronizar_pedido`: es un caso especial que necesita saltarse la ventana del mismo día que exigen las RLS normales, así que valida ella misma que quien llama sea admin en vez de sumar una policy de update/delete sobre `pedido_items`. El total se recalcula solo (el trigger de siempre) y eso alcanza para que comisiones y el reporte semanal reflejen la corrección sin tocarles una línea.

## 14. Estadísticas (admin) y Resumen (vendedor)

El dueño pidió que el admin tuviera más formas de ver el negocio — un panel de estadísticas, qué comercio compró más — y que el vendedor también pudiera ver más de lo suyo. No hizo falta ninguna migración: es todo lectura sobre las mismas tablas de siempre.

- **`/estadisticas`** (admin, nuevo en el nav): tres rankings — comercios que más compraron, productos más vendidos y vendedores, con una barra proporcional al máximo de cada lista para que se lea de un vistazo quién lidera. Selector de período igual al de `/pedidos` (mes o "todo el historial"). `lib/estadisticas.ts` reutiliza `itemsDeLosPedidos` de `reporte-semanal.ts` (la función que ya resolvía traer los ítems de muchos pedidos sin pasarse del largo de URL que soporta PostgREST) en vez de duplicar esa lógica.
- **`/resumen`** (vendedor, cuarta pestaña de la barra inferior): la misma idea pero acotada a lo propio — cuánto vendió en el mes, cuánto ganó de comisión, cuántas visitas hizo, y sus propios rankings de comercios y productos. No hizo falta ninguna policy nueva: las RLS de `pedidos`/`pedido_items`/`visitas` ya restringen al vendedor a lo suyo.
- **Se encontró y corrigió un agujero del mock de pruebas** (no de la app): `mock-supabase.mjs` no entendía `HEAD` ni `Prefer: count=exact`, que es como `.select(col, { count: "exact", head: true })` de supabase-js pide "cuántas filas hay" sin bajarlas. Eso lo usa `/resumen` para contar visitas, pero también las acciones de borrado (`eliminarComercio`, `eliminarProducto`, `eliminarUsuario`) para chequear si hay historial antes de dejar eliminar — así que ese bloqueo nunca se había probado de verdad contra el mock hasta ahora. Contra Supabase real esto siempre funcionó (soporta `count=exact` de fábrica); era un hueco del doble de prueba, pero como tapaba una validación de seguridad de datos, se corrigió en el mock para que la próxima vez que algo dependa de un conteo, la prueba lo detecte si se rompe.
