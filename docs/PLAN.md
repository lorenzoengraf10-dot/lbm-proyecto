# Plan de Desarrollo — La Buena Medida (LBM)

> **Estado: etapas 1 y 2 completas.** El plan de abajo quedó confirmado; las secciones 2 y 2.1 documentan las decisiones que se tomaron sobre los puntos ambiguos. La sección 6 anota las correcciones que salieron de la revisión de las dos primeras etapas.

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
| 7 | Contenido del QR | Texto plano con el código interno del comercio (ej. `CP1`), no una URL pública — así el QR no sirve de nada fuera de la app. |
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
3. **Generación e impresión de QR** — QR por comercio a partir de su código, descarga individual y en lote (ZIP) desde el panel.
4. **App del vendedor — escaneo y pedido (con conexión)** — login vendedor, listado de comercios con buscador, escaneo de QR → crea Visita, catálogo interactivo → carga Pedido asociado, ver último pedido del comercio como referencia.
5. **Modo offline** — persistencia local (SQLite) de visitas/pedidos, cola de sincronización con IDs idempotentes, reintento automático al recuperar señal, indicador de "pendiente de sincronizar".
6. **Dashboard + Reporte PDF semanal** — dashboard admin (ventas del día/semana, ranking de productos, cobertura de visitas en tiempo real), generación de PDF semanal con selector de semana (ventas por vendedor/producto, cobertura, comisión 3%).

Cada etapa es funcional de punta a punta antes de pasar a la siguiente.

## 6. Correcciones de la revisión (etapas 1 y 2)

Cosas que se arreglaron al revisar las dos primeras etapas juntas. Las migraciones se editaron en el lugar porque todavía no hay ningún proyecto Supabase con el esquema aplicado; una vez que lo haya, cualquier cambio de esquema tiene que ir en una migración nueva.

**Seguridad (RLS)**

- `rol_actual()` ahora ignora a los usuarios dados de baja (`... and activo`). Antes, un vendedor desactivado seguía pudiendo leer la cartera y cargar visitas y pedidos: la baja solo lo frenaba en el panel.
- Ninguna policy se conforma con "estar logueado". Antes, `comercios` y `productos` se leían con solo `activo = true`, así que cualquier cuenta autenticada del proyecto veía toda la cartera de clientes. Ahora todas exigen un usuario activo del negocio.
- Se apagó el registro público en `supabase/config.toml` (`enable_signup = false`), que viene prendido por defecto. Hay que apagarlo también en el dashboard del proyecto real.
- La ventana de edición de pedidos ("mismo día") y la visibilidad cruzada entre vendedores se verificaron con casos concretos contra un Postgres local.

**Modelo de datos**

- `usuarios.comision_pct` y `pedido_items.subtotal` pasaron a `not null`: el trigger y la columna generada siempre los completan, y dejarlos nulos obligaba a manejar un caso que no puede pasar.
- Las filas de `configuracion` se movieron de `seed.sql` a una migración: la app las necesita para funcionar (el alta de un vendedor falla sin `tasa_comision_default`), así que no son datos de ejemplo.
- `productos.nombre` es único sin distinguir mayúsculas. En un catálogo de 15-20 ítems dos productos con el mismo nombre son un error de carga, y el vendedor no podría distinguirlos en la app.

**Panel**

- Cada server action valida que quien la llama sea admin. No alcanza con el guard del layout: las actions son endpoints HTTP propios y se pueden llamar directo.
- El proxy copia las cookies renovadas cuando además redirige. Sin eso, si el token se renovaba justo en un request que redirigía, el refresh token rotado se perdía y la sesión se caía sola.
- La validación del CSV se hace de nuevo en el servidor al confirmar la importación, en vez de confiar en lo que muestra la previsualización.
- El formulario de alta queda abierto y limpio después de guardar, con el aviso a la vista, para poder cargar varios seguidos.
