# Plan de Desarrollo — La Buena Medida (LBM)

> **Estado: propuesta inicial, pendiente de confirmación.** No se generó código de la aplicación todavía — solo este documento — a la espera de que se confirmen o ajusten los puntos de la sección 2.

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
| 1 | Mecanismo de login (no se especifica) | Email + contraseña vía Supabase Auth. El admin crea las cuentas de los vendedores (sin auto-registro público). |
| 2 | ¿Se puede editar/anular un pedido ya cargado? | Sí, pero solo el mismo día de la carga. Pasado ese plazo queda fijo, para no romper la trazabilidad de comisiones ya calculadas/reportadas. |
| 3 | ¿Cuentan varias visitas al mismo comercio en la misma semana? | Se registra cada escaneo como visita independiente (sin límite). Para "cobertura semanal" alcanza con ≥1 visita esa semana. |
| 4 | Baja de vendedores (no mencionado explícitamente, sí para comercios/productos) | Mismo patrón: campo `activo`, nunca se borra (mantiene histórico de ventas/comisiones). |
| 5 | Comisión "hoy 3% fijo, pero puede variar por vendedor a futuro" | Se guarda el % de comisión en cada vendedor, con default = constante global configurable. Así el día de mañana se ajusta por persona sin migrar el modelo. |
| 6 | Definición de "semana" para reportes/cobertura | Semana calendario lunes a domingo, huso horario `America/Argentina/Buenos_Aires`. |
| 7 | Contenido del QR | Texto plano con el código interno del comercio (ej. `CP1`), no una URL pública — así el QR no sirve de nada fuera de la app. |
| 8 | Multi-dispositivo por vendedor | Permitido sin restricción; no hay pairing de dispositivo único por usuario. |

Si alguno de estos no es lo que se espera, se ajusta antes de tocar el modelo de datos (etapa 1).

### 2.1 Detalle — contraseña propia y privada por usuario

Sobre el punto 1: cada usuario (admin o vendedor) tiene su propia contraseña, que nadie más conoce ni puede ver — ni otro vendedor, ni el admin, ni quien programe la app.

- **Por qué es "secreta" de verdad**: Supabase Auth nunca guarda la contraseña en texto plano, la guarda hasheada (bcrypt). Ni mirando la base de datos se puede leer cuál es — solo se puede validar (¿coincide o no?) o resetear (asignar una nueva). Esto ya viene resuelto por la librería, no hay que construirlo.
- **Usuario en vez de email**: como los vendedores pueden no tener (o no chequear) un email, el login se muestra como "Usuario + Contraseña" (ej. usuario `juan`), y puertas adentro se mapea a un email técnico (`juan@lbm.local`) que Supabase necesita pero que el vendedor nunca ve ni usa.
- **Alta**: el admin crea la cuenta desde el panel (nombre del vendedor) y el sistema genera una contraseña temporal. El admin se la pasa en persona o por WhatsApp (equipo chico, de confianza).
- **Primer login**: la app obliga a cambiarla por una contraseña elegida por el propio vendedor. Desde ese momento deja de ser conocida por el admin — es exclusiva de esa persona.
- **Si la olvida**: como no dependemos de un email real, el reseteo lo hace el admin desde el panel (genera un nuevo temporal); no hay "link de recuperación" por correo.
- **Uso diario**: la sesión queda iniciada en el celular (no pide contraseña cada vez que se abre la app), con un botón visible de "cerrar sesión" por si el dispositivo se comparte o se pierde.

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
│   ├── seed.sql            # datos de prueba (admin + vendedores + productos demo)
│   └── functions/          # Edge Functions: generación de PDF, export de QR en lote
├── docs/
│   └── PLAN.md             # este documento
├── package.json            # root, workspaces
└── pnpm-workspace.yaml
```

## 5. Plan de etapas

1. **Modelo de datos + backend básico** — esquema SQL en Supabase (usuarios/roles, comercios, productos, visitas, pedidos, pedido_items, configuración de comisión), Row Level Security (admin ve todo; vendedor solo lee catálogo/cartera y escribe lo propio), seed de prueba, script de importación CSV de comercios.
2. **Panel admin — catálogo y comercios** — login admin, CRUD de productos (alta/edición/baja/precio), CRUD de comercios (alta/edición/baja) + pantalla de importación CSV inicial.
3. **Generación e impresión de QR** — QR por comercio a partir de su código, descarga individual y en lote (ZIP) desde el panel.
4. **App del vendedor — escaneo y pedido (con conexión)** — login vendedor, listado de comercios con buscador, escaneo de QR → crea Visita, catálogo interactivo → carga Pedido asociado, ver último pedido del comercio como referencia.
5. **Modo offline** — persistencia local (SQLite) de visitas/pedidos, cola de sincronización con IDs idempotentes, reintento automático al recuperar señal, indicador de "pendiente de sincronizar".
6. **Dashboard + Reporte PDF semanal** — dashboard admin (ventas del día/semana, ranking de productos, cobertura de visitas en tiempo real), generación de PDF semanal con selector de semana (ventas por vendedor/producto, cobertura, comisión 3%).

Cada etapa es funcional de punta a punta antes de pasar a la siguiente.
