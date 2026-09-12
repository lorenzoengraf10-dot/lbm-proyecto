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

## 15. Carteles QR en PDF, y la revisión que vino después

El dueño pidió poder bajarse todos los carteles en un PDF — con el código del comercio y el nombre abajo — para llevarlo a una imprenta en vez de depender del "imprimir" del navegador.

- **`/comercios/imprimir-qr/pdf`**: una hoja A4 cada seis carteles, en el mismo tamaño real de 7×9 cm que ya salía por HTML, con la línea de corte punteada. Arriba "LA BUENA MEDIDA", el QR, y abajo el código bien grande, el nombre y la localidad. `?incluir=todos` agrega los dados de baja por si hay que reimprimir alguno.
- El QR se dibuja como **un solo camino SVG** (`caminoDelQr`, la misma función que ya usaba el cartel individual) y pdf-lib lo entiende tal cual con `drawSvgPath`. La alternativa —un rectángulo por módulo— serían decenas de miles de rectángulos para cien comercios; así el PDF de veinte comercios pesa 20 kB.
- Los nombres largos se achican solos y, si aun así no entran, se cortan con puntos suspensivos, en vez de pisarse con el borde.
- **Verificado de punta a punta**: se renderizó el PDF con pdf.js y se decodificaron los veinte QR con un lector de verdad (jsQR). Los veinte devuelven su `LBM:<código>` correcto — que es lo único que prueba que un QR dibujado en un PDF sea realmente escaneable y no esté espejado o corrido.

### Bugs que aparecieron revisando

**Los códigos se ordenaban como texto.** `CP1, CP10, CP11, CP12… CP2, CP20`. Con una cartera de CP1 a CP100 eso hace difícil encontrar un comercio en la lista y convierte en un rompecabezas repartir los carteles impresos. Ahora hay un comparador numérico (`ordenarPorCodigo`, en `@lbm/shared`) que se usa en el listado de comercios, la hoja de QR, el PDF, los empates de cobertura, la lista de "sin visitar" del reporte y el catálogo que baja el vendedor al celular.

**Un parámetro inválido en la URL tumbaba la pantalla.** `?mes=basura` (o `?mes=2026-13`) terminaba en `Invalid time value` y devolvía un 500 en `/pedidos`, `/estadisticas` y el `/resumen` del vendedor. Lo mismo con `?semana=` en `/reportes` y en la descarga del PDF semanal — ahí la validación existía pero solo miraba la forma con una expresión regular, así que `9999-99-99` pasaba igual y reventaba después. Ahora `mesDesdeValor` y `semanaDeDia` devuelven `null` cuando el valor no sirve, y cada pantalla cae al período por defecto en vez de romperse. No era un agujero de seguridad (todo está detrás del login), pero un enlace viejo o un copiar y pegar cortado mostraba un error en vez de la pantalla.

**El `/resumen` del vendedor pedía los ítems sin tandas**, el mismo problema de URL demasiado larga que ya se había corregido en el reporte semanal: un mes cargado son varios cientos de pedidos y la lista de ids no entra en la URL. Ahora va de a 200, igual que el panel.

**Una prueba estaba atada a un número fijo** de comercios de la base de prueba, así que fallaba cada vez que se cambiaban los datos. Ahora compara el catálogo con señal contra el catálogo sin señal, que es lo que en realidad se quiere probar.

## 16. Velocidad

El panel se sentía lento y valía la pena medir antes de tocar nada. Con el mock de la base configurado para tardar 120 ms por consulta —que es lo que cuesta un viaje de ida y vuelta entre una función en Estados Unidos y Supabase en São Paulo— salió esto:

| pantalla | antes | solo el código | código + región |
|---|---:|---:|---:|
| portada | 872 ms | 592 ms | 247 ms |
| pedidos | 687 ms | 686 ms | 123 ms |
| estadísticas | 686 ms | 550 ms | 103 ms |
| comisiones | 545 ms | 548 ms | 100 ms |
| cobertura | 546 ms | 547 ms | 95 ms |
| reporte semanal | 692 ms | 558 ms | 106 ms |
| comercios | 547 ms | 549 ms | 93 ms |
| **total** | **4575 ms** | **4030 ms** | **867 ms** |

**Lo que más pesaba no era el código: era la distancia.** Ninguna de las dos apps declaraba región, así que Vercel las ponía por defecto en Estados Unidos mientras la base está en São Paulo. Cada consulta cruzaba el continente dos veces. Y como hasta la pantalla más simple hace cuatro viajes encadenados —el proxy valida el token, `requerirAdmin` lo vuelve a validar, busca el perfil, y recién ahí consulta los datos— eso solo ya son medio segundo de puro viaje. Con `"regions": ["gru1"]` en el `vercel.json` de cada app, la función corre al lado de la base y esos mismos cuatro viajes cuestan casi nada.

**No se tocó la cadena de autenticación**, aunque tres de esos cuatro viajes son de autenticación. Se podría ahorrar uno confiando en la cookie en vez de validar el token contra el servidor de Auth, pero eso es exactamente lo que mantiene cerrado el ecosistema: `getUser()` pregunta, `getSession()` solo lee lo que el navegador dice. Con la región arreglada esos viajes salen unos pocos milisegundos, así que no hay nada que ganar aflojando la seguridad.

Después sí quedaron cosas del código:

- **La portada hacía dos vueltas encadenadas.** Traía los últimos cinco pedidos y, recién con esos ids en la mano, iba a buscar los nombres de los comercios y los vendedores. Un viaje entero de ida y vuelta en la pantalla que más se abre. Ahora la cartera y los vendedores se traen enteros en la misma tanda: son pocas filas y sale más barato que encadenar. De 47 consultas a 30, y de 872 a 592 ms.
- **Los ítems de los pedidos se pedían aparte.** El reporte semanal, las estadísticas y el resumen del vendedor traían los pedidos y después los ítems con un `.in()` de todos los ids. Eso era un viaje de más y además armaba una URL de decenas de kB cuando el período traía muchos pedidos (el problema de la sección 15). PostgREST permite anidar la consulta: `select=id, total, pedido_items(producto_id, cantidad, subtotal)` trae todo junto, en un solo viaje, sin límite de URL. Desapareció el código de tandas.
- **`/mis-pedidos` del vendedor hacía dos consultas independientes una atrás de la otra.** Ahora salen juntas.

Y en la app del vendedor, lo que más se nota en la calle:

- **El service worker ahora sirve los archivos de `/_next/static/` desde la caché sin preguntar a la red.** Llevan un hash en el nombre, así que si cambia el contenido cambia el nombre: el que está guardado sirve para siempre. Antes cada pedazo de la app esperaba a una conexión que, con media barra de señal, tarda segundos en contestar aunque el archivo ya estuviera en el celular. Van en su propia caché, con un tope de 200 archivos para que no crezca sin fin deploy tras deploy; el resto sigue yendo a la red primero, que es lo correcto para los datos.

### La batería de pruebas, al día

Casi todos los scripts de prueba tenían valores escritos a mano —"5 comercios", "6 pedidos", "Juan Vendedor", ids fijos— que en realidad venían de datos que se habían ido acumulando en la base de prueba de sesiones anteriores. Pasaban por costumbre, no porque el dato fuera correcto. Ahora:

- La base de prueba se reconstruye desde una plantilla **antes de cada script** (`reiniciar-db.sh`), así ninguno depende de lo que dejó el anterior.
- Lo que se espera se **calcula con SQL** en el momento (`sql.mjs`) en vez de estar escrito en el script.
- Hay un script nuevo, `prueba-agregados.mjs`, que compara los números que muestran el reporte semanal, las estadísticas y el resumen del vendedor contra lo que dice la base. Es el que prueba de verdad que las consultas anidadas traigan lo mismo que traían las dos consultas separadas.
- `correr-pruebas.sh` corre las dieciséis: **176 chequeos, todos en verde**.

También aparecieron dos cosas del entorno de prueba, no de la app: el stub del schema `auth` borraba y recreaba roles que son del cluster (fallaba en cuanto había una segunda base), y la prueba de corrección contaba como error de consola el 400 que ella misma provoca a propósito al verificar que un vendedor no pueda corregir pedidos.

## 17. Estados del pedido, cobro y comisión que no reescribe el pasado

Dos pedidos del dueño que terminaron siendo el mismo problema.

**El pedido ahora pasa por tres estados**: `pedido` (tomado en el comercio) → `preparado` (armado en el local) → `completado` (entregado). Al completarlo hay que decir cómo se cobró: efectivo, transferencia o **queda debiendo**, que es la cuenta corriente de toda la vida — la mercadería sale y se cobra después. Un pedido a cuenta queda marcado "sin cobrar" hasta que alguien toca *Marcar como cobrado*, y tanto la portada como la lista de pedidos avisan cuánta plata hay dando vueltas.

Los dos, el dueño y el repartidor, pueden mover cualquier estado. Para el repartidor eso significa que tiene que andar **sin señal**: los cambios van a una cola propia en el celular, igual que los pedidos, y suben solos cuando vuelve la conexión. La cola de estados se sincroniza *después* de la de pedidos, a propósito: si cargó el pedido y lo entregó todo sin señal, el pedido tiene que existir en la base antes de que se le pueda cambiar el estado. Si aun así no llegó, el cambio espera a la próxima pasada.

**La comisión se congela en el pedido.** Esto es lo que obligó a tocar el modelo. Hasta ahora se calculaba en vivo: total del pedido × porcentaje que tuviera el vendedor *en ese momento*. Con eso, subirle la comisión al repartidor de 3% a 5% reescribía todo el historial — un reporte semanal de hace un mes pasaba a mostrar otro número, y una comisión ya pagada dejaba de coincidir con lo que decía el sistema.

La solución es la que el proyecto ya usaba para los precios (`pedido_items.precio_unitario`): guardar el valor dentro del pedido cuando se crea. `pedidos.comision_pct` se completa al insertar, y de ahí en más nadie lo toca. El dueño cambia el porcentaje desde la ficha del vendedor y el cambio vale para los pedidos que vengan; los anteriores quedan exactamente como estaban.

El porcentaje lo pone un **trigger**, no solo las funciones: si algún día un pedido entra por otro camino —una carga a mano, un script, una función nueva— igual queda congelado. Es el mismo patrón que `trg_set_comision_pct_default` sobre usuarios, un escalón más abajo.

Como consecuencia, todo lo que suma comisiones (la pantalla de Comisiones, el reporte semanal, el Resumen del vendedor y la ficha del repartidor) pasó a sumar **pedido por pedido con su propio porcentaje** en vez de multiplicar un total por un número. Un período que cruza un cambio de comisión suma bien las dos mitades, y la pantalla muestra "3% y 5%" en vez de un número que no explicaría el total.

**La comisión ahora se gana con el pedido entregado**, no con el pedido tomado: Comisiones y el reporte semanal cuentan solo los completados. Estadísticas sigue contando todos los pedidos, porque ahí la pregunta es comercial ("qué cliente compra más"), no cuánta plata hay que pagar; cada pantalla dice qué cuenta.

### Decisiones que vale la pena recordar

- **Mover el estado no se hizo con una policy de update sobre `pedidos`.** Eso le habría dado al vendedor permiso para tocar también el total o la fecha. Es una función `security definer` que solo mueve las columnas del estado y del cobro, y hace ella misma el control: el admin cualquier pedido, el vendedor solo los suyos. Las RLS de pedidos siguen cerradas a la ventana del mismo día, que es para editar ítems — otra cosa.
- **Los pedidos que ya existían se dieron por completados** en la migración. Si hubieran quedado en `pedido` habrían desaparecido de las comisiones, que ahora cuentan solo los entregados. La forma de pago les queda en null y la pantalla lo dice —"sin registrar"— en vez de inventar un efectivo que nadie confirmó.
- **Volver atrás un estado limpia el cobro**, porque el pedido deja de estar entregado. El botón lo avisa antes de hacerlo.

### El bug que apareció probando

Al marcar un pedido **sin señal**, la pantalla llamaba a `router.refresh()` igual que cuando sube bien. Sin conexión eso trae la página cacheada —con el estado viejo— y encima se lleva puesto el aviso de "guardado en el celular". El repartidor veía el pedido sin cambiar y ningún mensaje: exactamente el escenario en el que hay que confiar en la app. Ahora solo se refresca cuando el cambio llegó al servidor. Es el mismo error que ya había pasado en la sección 12 con `recargar()` en la ruta de rechazo: refrescar desde el servidor pisa lo que el cliente acaba de aprender.

## 18. El repartidor entra con su nombre y un PIN

El dueño quería que entrar fuera un toque y unos números, en vez de escribir un usuario y una clave de diez caracteres. El problema es evidente: un PIN es un secreto chico. Con seis dígitos hay un millón de combinaciones, y si alguien puede probar sin límite, un millón se agota solo.

Lo que hace que igual sea seguro son dos cosas que van juntas:

**1. El PIN no es la contraseña de Supabase Auth.** Lo que se guarda en Auth es `HMAC(secreto_del_servidor, usuario + PIN)`: 64 caracteres que nadie puede armar sin el secreto. Así, aunque alguien conozca la URL del proyecto y la clave pública, no puede probar PIN contra el endpoint de Auth — no sabe qué mandar. Todo intento tiene que pasar por la app.

**2. Y como pasa por la app, ahí se cuenta y se frena.** Cinco errores seguidos bloquean la cuenta quince minutos (`public.intentos_pin`). Estando bloqueada no entra ni con el PIN correcto. El dueño la destraba poniéndole un PIN nuevo desde el panel.

El secreto que se usa para el HMAC es la service role key del proyecto, que ya vive solo en el servidor. **Rotarla invalida todos los PIN**: si algún día hay que cambiarla, hay que volver a fijarle el PIN a cada repartidor.

### Lo que se dejó de hacer

**El PIN lo pone el dueño, no el repartidor.** Se fija desde la ficha del vendedor, se muestra una sola vez para pasárselo, y no queda guardado en ningún lado — ni en la base ni en el panel. Si se lo olvida, se le pone otro. Se rechazan los obvios (`111111`, `123456`, `121212`).

**Se sacó el candado de PIN local.** Antes había dos PIN: la contraseña larga para entrar y un PIN de cuatro dígitos para desbloquear la app en el celular. Ahora que entrar ya son seis números, un segundo candado encima sería exactamente lo contrario de lo que se pidió. La sesión manda, y salir es un botón.

**La lista de repartidores se muestra sin haber entrado.** Es la única cosa que la app cuenta antes de autenticar: los nombres de pila del personal. En un negocio familiar de pueblo eso no es secreto, y a cambio se gana que entrar sea un toque y seis números. El celular recuerda quién es, así que a partir de la segunda vez ni siquiera hay que elegir.

### Dos agujeros que aparecieron en el camino

Los dos los disparó la misma pregunta del dueño: *"y por si alguien usa el mismo código, que no entren al perfil del otro"*.

**El PIN no estaba atado al repartidor.** Se guardaba en el celular con una clave fija. Si Juan configuraba 1234 en un teléfono y después entraba Ana con su credencial, Juan podía poner *su* PIN y desbloquear la sesión *de Ana*. Con el login nuevo el problema desaparece de raíz: el PIN se verifica contra el servidor, contra la cuenta que se eligió.

**Y lo más serio: en un celular compartido quedaban los datos del anterior.** Catálogo, nombre y —lo grave— la cola de pedidos sin subir. Esa cola se habría sincronizado con la sesión del nuevo, y como `sincronizar_pedido` fuerza `vendedor_id = auth.uid()`, los pedidos de uno habrían terminado contados, y comisionados, al otro. Ahora el celular guarda de quién son los datos y, si entra otro, borra todo lo del anterior antes de mostrar nada.

### Un bug de producción que salió probando

La pantalla de login quedaba **prerenderizada en el build**: la lista de repartidores se consultaba una sola vez, sin base, y la pantalla habría mostrado para siempre "todavía no hay repartidores cargados". Se arregla con `export const dynamic = "force-dynamic"`. Vale recordarlo para cualquier página que consulte datos sin sesión.

Y dos del entorno de prueba, que estaban tapando fallas reales: el mock no entendía los operadores `is` ni `neq` (así que la portada del admin recibía listas vacías en silencio en vez de los pedidos por preparar y lo impago), y la base de prueba guardaba fechas absolutas, así que al día siguiente "hoy" ya no era hoy y las pruebas de visitas del día empezaban a fallar solas. Ahora `reiniciar-db.sh` corre todas las fechas el mismo tanto para que la actividad más reciente vuelva a quedar recién hecha.

### El panel también entra por PIN

El dueño pidió lo mismo para él: tocar su nombre y escribir seis números, en vez de la contraseña. Va sobre exactamente el mismo mecanismo —HMAC con el secreto del servidor, intentos contados en `intentos_pin`— con dos diferencias:

- **El bloqueo dura una hora**, no quince minutos. La cuenta de administrador puede todo: borrar comercios, cambiar comisiones, corregir pedidos viejos. Si alguien se pone a probar, que espere más.
- **Queda el camino de la contraseña**, atrás de un "Entrar con contraseña". Es imprescindible: al repartidor que pierde el PIN se lo resetea el dueño, pero **al dueño no lo destraba nadie**. Sin ese respaldo, olvidarse el PIN sería quedarse afuera del propio negocio.

Conviene tener presente que fijar un PIN **reemplaza la contraseña** (es la misma credencial de Auth vista de dos maneras). O sea: si se quiere dejar la contraseña de respaldo lista, hay que cambiarla *después* de poner el PIN. La ficha del usuario lo dice.

El panel lista solo a los administradores, no a los repartidores, y viceversa: cada puerta muestra únicamente a quien puede entrar por ella.

## 19. Cargar la cartera desde un Excel

Ya existía la importación por CSV, pero el dueño no arma CSV: arma una planilla en Excel, con el nombre, el código y el teléfono. Ahora la misma pantalla acepta las dos cosas.

**Se lee con ExcelJS, en el servidor.** El peso de la librería no llega al navegador, y a cambio no hay que pelear con los casos raros de un .xlsx real (celdas con fórmula, texto con formato, números que Excel guarda como número).

Lo que hace que ande con una planilla hecha a mano y no solo con una perfecta:

- **Busca la fila de encabezados**, no asume que es la primera. Una planilla casera suele tener un título arriba y alguna fila vacía; se recorren las primeras veinte hasta encontrar una que tenga *código* y *nombre*.
- **Acepta los nombres de columna como salgan**: `codigo`/`código`/`cod`/`cp`, `telefono`/`teléfono`/`tel`/`celular`/`whatsapp`. Exigir un encabezado exacto era garantía de que la primera importación fallara.
- **Un teléfono escrito como número no se pierde.** Excel convierte `2920412233` en número y una lectura ingenua lo dejaría como `2.92041e+09`.
- **Las filas vacías del medio se saltean sin avisar.** En una planilla a mano siempre sobran; anunciarlas como error sería solo ruido.
- **Los errores nombran la fila que se ve en Excel.** Si el archivo tiene un título arriba y filas vacías salteadas, la posición en la lista no es la fila de la planilla. Se lleva el número real de cada fila para que "Fila 9" sea la fila 9 de la pantalla del dueño.

**La localidad se pone una vez, arriba.** La columna es obligatoria en la base, pero casi toda la cartera está en la misma localidad, así que repetirla en cada fila del Excel no tiene sentido. Se carga en la pantalla (viene con *Carmen de Patagones*) y vale para todo el archivo; si el Excel trae una columna `localidad`, esa manda. Cambiar el valor rehace la previsualización, para que lo que se ve sea lo que se va a guardar.

El archivo se parsea **siempre en el servidor**, también al previsualizar: la previsualización es lo que se muestra, no lo que se guarda. El Excel viaja en base64 porque es binario; el CSV sigue viajando como texto.

### Un error que estaba tapado

Al tocar `packages/shared` salió que su `typecheck` venía **fallando desde el commit del login por PIN**: `derivarPassword` usa `crypto.subtle` y `TextEncoder`, que son globales en el navegador y en Node pero cuyos tipos viven en `lib.dom`, y el tsconfig de ese paquete solo cargaba `ES2022`. No rompía nada en producción —las dos apps compilan con su propio tsconfig, que sí incluye DOM— pero dejaba el chequeo del repo en rojo. Se me pasó por filtrar la salida de `pnpm typecheck` con `tail`, que se comió el error. Conviene mirar la salida completa, o filtrar por `error TS` en vez de por las últimas líneas.
