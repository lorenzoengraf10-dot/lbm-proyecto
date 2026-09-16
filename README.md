# lbm-proyecto

App interna de pedidos y cobertura de ruta para La Buena Medida.

Ver [docs/PLAN.md](docs/PLAN.md) para el plan de desarrollo (stack, estructura y etapas).

## Estado

- **Etapa 1 — Modelo de datos y backend**: completa. Esquema, RLS por rol, scripts de siembra e importación.
- **Etapa 2 — Panel admin**: completa. Login, comercios (CRUD + importación CSV), productos (CRUD) y alta de cuentas.
- **Etapa 3 — QR**: completa. Cartel imprimible por comercio, individual y en hoja para toda la cartera.
- **Etapa 4 — App del vendedor**: completa. Página web (no app nativa, ver `docs/PLAN.md` sección 9): login + PIN de desbloqueo, listado de comercios con buscador, escaneo de QR, carga de pedido y último pedido del comercio como referencia.
- **Etapa 5 — Modo sin señal**: completa. El catálogo queda guardado en el celular y lo que el vendedor carga va a una cola local que se sube sola cuando vuelve la señal. Los identificadores se generan en el celular, así que reintentar no duplica nada.
- **Etapa 6 — Pedidos, comisiones y reportes**: completa. El panel tiene **Pedidos** (con dos solapas: el listado con filtros y la hoja para armar), **Cobertura** (hace cuánto que nadie visita cada comercio) y **Números**, donde viven lo facturado, los rankings, lo que hay que pagar de comisiones y el reporte semanal en PDF.
- El vendedor puede además **corregir o anular** un pedido el mismo día que lo cargó; pasada esa ventana queda fijo, para no mover comisiones ya reportadas.
- El admin puede **ver el registro por mes y corregir cualquier pedido**, incluso viejo, desde su detalle — queda anotado quién, cuándo y por qué (`docs/PLAN.md` sección 13).
- **Números** (admin): en una sola pantalla y con un solo período, lo facturado, el ticket promedio, qué comercios compran más, qué productos se venden más, cuánto vendió cada repartidor y cuánto hay que pagarle. Antes eran tres secciones —Estadísticas, Comisiones y Reporte— que contestaban casi lo mismo pero cada una con su propio selector de fecha (por mes, por desde/hasta y por semana), así que había que aprender cuál mira qué y comparar entre ellas era imposible. Las direcciones viejas siguen andando: redirigen traduciendo el período. El vendedor tiene su versión personal en **Resumen** (`docs/PLAN.md` sección 14).
- **Carteles QR en PDF**: desde *Comercios → QR para imprimir*, un PDF con todos los carteles (QR + código + nombre), seis por hoja A4 en tamaño real, listo para llevar a una imprenta (`docs/PLAN.md` sección 15).
- **Estados del pedido y cobro**: cada pedido va de *Pedido* a *Preparado* a *Completado*, y al completarlo se registra si se cobró en efectivo, por transferencia o quedó debiendo. Lo que queda a cuenta se ve en la portada hasta que se marca cobrado. Tanto el dueño como el repartidor pueden marcarlo, y el repartidor también sin señal (`docs/PLAN.md` sección 17).
- **Comisión editable sin tocar el pasado**: el dueño cambia el porcentaje del repartidor desde su ficha; vale para los pedidos nuevos y los ya hechos quedan con el porcentaje que tenían, porque se congela dentro de cada pedido al crearlo. La comisión se gana con el pedido entregado.
- **Se entra con nombre y PIN**: tanto al panel como a la app del repartidor se entra tocando el nombre y escribiendo seis números. El dueño fija los PIN desde la ficha de cada usuario, incluido el suyo. Varios errores seguidos bloquean la cuenta (quince minutos en la app, una hora en el panel). El panel conserva "Entrar con contraseña" como respaldo, porque al dueño nadie le puede resetear el PIN (`docs/PLAN.md` sección 18).
- **Planilla para armar**: la hoja con la que se arman los pedidos a la mañana, en la solapa **Para armar** de Pedidos y también en la app del repartidor. Un día o un tramo de días, con la opción de ver solo lo que falta armar, y un Excel listo para imprimir con una casilla al costado de cada comercio para ir tachando.
- **Mapa de la cartera**: cada comercio con un punto sobre el mapa de Carmen de Patagones, del color de cómo le fue en el período (pidió / se lo visitó sin pedido / ni se pasó), con el pueblo partido en zonas y un resumen de cuánto vende cada una. La ubicación la toma el repartidor con el GPS al pasar por la puerta, o la marca el dueño desde la ficha del comercio.
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

Desde el panel, *Comercios → Importar*. Sirve un **Excel** (.xlsx) o un CSV con las columnas `codigo`, `nombre` y `telefono`:

| codigo | nombre | telefono |
|---|---|---|
| CP1 | Almacén Don José | 2920412233 |
| CP2 | Kiosco Sur | 02920-45-6677 |

No hace falta que la planilla esté prolija: puede tener un título arriba, filas vacías en el medio, y los títulos de las columnas escritos como salga (`código`, `cod`, `tel`, `celular`…). Los códigos se guardan en mayúsculas y, si uno ya existe, se actualizan sus datos en vez de duplicarlo.

La **localidad** se carga una sola vez en la pantalla y vale para todo el archivo (viene con *Carmen de Patagones*). Si el archivo trae una columna `localidad`, esa manda.

Antes de guardar nada se muestra una previsualización con lo que va a entrar y qué filas se saltean y por qué.

## Planilla para armar

**Pedidos → Para armar**, la segunda solapa. Una fila por comercio: una casilla vacía para tachar, el código, el nombre, y lo que pidió escrito un producto atrás del otro hasta que no le queden más.

| Hecho | Código | Comercio | Pedido | | | | Total $ |
|---|---|---|---|---|---|---|---|
| ☐ | CP1 | Almacén Don José | Aceitunas 6,5 kg | Bondiola 4,5 kg | Huevos 3 doc. | Manteca 1 un. | $ 160.750,00 |
| ☐ | CP3 | Despensa Rivadavia | Bondiola 1,5 kg | Chorizo 1 kg | Lomo 4 kg | | $ 115.300,00 |
| | CP6 | Minimercado Los Álamos | | | | | |

Debajo va **Para preparar**: el total de cada producto, con el nombre completo y la cantidad, cada uno con su casilla, y al pie el total separado por unidad (`111,5 kg · 12 doc. · 34 un.`).

### La casilla para tachar

Va solo en el Excel, que es lo que se imprime; en la pantalla no tendría sentido porque la marca no se guarda en ningún lado. Una por comercio que pidió —al que le sigue el pedido en el renglón de abajo se le tacha una vez, cuando está armado entero— y una por producto en el resumen. El que no pidió no lleva casilla: no hay nada que armarle.

El recuadro es más grueso y más oscuro que la cuadrícula de la hoja. La planilla se imprime cuadriculada, así que una casilla fina y clarita sería un cuadradito más entre todos los demás.

### Un día o un tramo de días

Arriba van **Desde** y **Hasta**, con atajos a *Hoy*, *Ayer* y *Últimos 7 días*. Sin tocar nada muestra el día de hoy, que es el uso de siempre.

Sobre un tramo de varios días las cantidades **se suman**: un comercio que pidió el lunes y el miércoles sale en un solo renglón con el total. Es lo que sirve para armar, pero quiere decir que la planilla de un tramo dice *cuánto en total* y no *cuándo* — no se reconcilia pedido por pedido. La pantalla lo aclara cuando el tramo es de más de un día.

Los extremos al revés se dan vuelta solos, un valor que no sirve cae al día de hoy, y un tramo de más de 62 días se recorta a los últimos 62 avisándolo en pantalla.

### Solo lo que falta armar

*Mostrar solo lo que falta armar* deja nada más los pedidos todavía sin preparar: se caen los que ya están armados y los entregados. El filtro va en la consulta y no filtrando la lista después, porque un comercio puede tener dos pedidos el mismo día y solo uno pendiente.

Cuando está puesto se ve en la pantalla y también en la hoja impresa (el resumen de arriba dice *Solo lo que falta armar*), y el archivo se baja con el sufijo `-por-armar`. Esto último importa: bajándolo dos veces el mismo día, una con filtro y otra sin, el navegador le pone "(1)" a la segunda y después no hay forma de saber cuál es cuál. La columna de pesos también cambia de sentido con el filtro puesto —pasa a ser lo que falta armarle a cada uno— así que el encabezado pasa a decir *Pendiente*.

Salen **todos** los comercios activos, así también se ve de un vistazo quién no pidió; *Mostrar solo los que pidieron* deja nada más los del tramo.

### El repartidor también la puede bajar

La app del repartidor tiene su propia pestaña **Planilla**, con los mismos controles y el mismo Excel: ve todos los comercios y todos los montos, igual que el dueño.

Eso no sale de su sesión normal. Las RLS limitan al repartidor a los pedidos que tomó él (`vendedor_id = auth.uid()`), y **esas políticas no se tocaron**: aflojarlas ampliaría para siempre lo que su token puede leer, incluido desde el navegador y desde la sincronización offline. En cambio la ruta de la planilla verifica primero quién llama —sesión válida, usuario activo, rol de vendedor— y recién entonces lee con el cliente de servicio. El permiso ampliado vive en un solo archivo (`apps/vendedor/src/lib/planilla-repartidor.ts`), igual que el del login por PIN.

Con un solo repartidor da lo mismo; el día que haya dos, cada uno va a ver la cartera y la plata del otro. Acotarlo a lo propio es agregar un filtro por `vendedor_id` en ese archivo.

Esa pantalla **necesita señal**: son los pedidos de todos los comercios, no solo los que cargó ese celular, así que salen del servidor y no del IndexedDB. Sin señal lo dice en criollo en vez de mostrar la planilla de ayer, que sería idéntica a simple vista.

### La abreviatura la elige el dueño

Al cargar un producto, además del nombre y la unidad, hay un campo **Abreviatura**: es cómo se escribe ese producto en la planilla, que se imprime en una hoja y donde "Queso rallado sachet" no entra. La lista de productos tiene una columna *En la planilla* que muestra cómo va a salir cada uno.

Es opcional. Si se deja vacía, la planilla **acorta el nombre sola** (en gris en esa columna): saca las preposiciones y se queda con lo mínimo que distinga a ese producto de los demás, así que quedan `Salame fino` y `Salame grueso`, nunca dos `Salame`. El acortado automático se calcula sobre el **catálogo entero** y no sobre los productos del día: si no, `Salame` podría ser uno el lunes y otro el martes y comparar dos planillas impresas engañaría.

Dos productos no pueden salir iguales en la planilla, que sería justo lo que la abreviatura tiene que evitar. Eso se cuida por tres lados (todo sin distinguir mayúsculas):

- Dos productos no pueden tener la misma abreviatura.
- Una abreviatura no puede ser el **nombre** de otro producto, ni al revés. Si existiera el producto "Mortadela" y a "Mortadela con pistacho" le pusieran de abreviatura "Mortadela", los dos saldrían igual y al de nombre corto no le quedaría nada más con qué distinguirse: no hay forma de arreglarlo al imprimir, así que se corta al guardar.
- La abreviatura **automática** de un producto tampoco puede coincidir con la que el dueño cargó a mano para otro. La base no puede verlo (la automática no está guardada), así que lo resuelve la planilla: las cargadas a mano mandan y la automática se corre a su siguiente opción.

### Cada unidad lleva su propio total

Un kilo y una docena no se pueden sumar juntos. Cada celda del pedido trae su unidad (`Huevos 3 doc.`, `Manteca 1 un.`), y el total del día va separado por unidad. La unidad sale del catálogo y se reconoce escrita de cualquier forma (`unidad`, `Unidades`, `un`, todas cuentan como la misma).

### Pensada para imprimirse

- **A4 apaisado**, todo el ancho en una sola hoja y tantas hojas de alto como haga falta, con los encabezados repetidos arriba de cada página.
- El ancho de la hoja **es fijo**: al comercio que pidió más productos de los que entran a lo ancho se le sigue el pedido en el renglón de abajo, con el código repetido en gris. Poner una columna por producto del que más pidió parecía lo natural, pero un pedido de dieciocho productos hacía una hoja tan ancha que al imprimirla Excel la achicaba a la mitad y no se leía nada.
- El nombre del comercio se pliega en dos renglones si es largo, y una abreviatura larga se achica un poco en vez de salir cortada por la celda de al lado.
- En el resumen de abajo, cada producto va con su nombre completo y, entre paréntesis, cómo aparece arriba: así el que mira la hoja impresa puede confirmar qué es cada abreviatura sin preguntarle a nadie.
- El ancho de las celdas del pedido sale del pedido más largo del día: ni cortado ni con aire de más.

### Detalles que importan al usarla

- El que no pidió queda con la fila vacía: se sigue viendo que existe y que ese día no pidió.
- Si un comercio hizo **más de un pedido en el mismo día**, se suman: para preparar interesa el total.
- Los productos de cada fila van siempre en el mismo orden (alfabético), así dos planillas de días distintos se comparan de un vistazo.
- Un comercio dado de baja que igual pidió ese día aparece, marcado como tal.

## Mapa de la cartera

**Mapa**, en la barra de arriba. Un punto por comercio sobre el mapa del pueblo, del color de cómo le fue en el período elegido:

- **verde**: pidió,
- **ámbar**: se lo visitó pero no compró — el más interesante de los tres, porque ahí hay algo que averiguar,
- **gris**: ni se pasó.

Además del color cambia el tamaño, así que impreso en blanco y negro, o para quien distingue mal los colores, el punto más grande sigue siendo el que vendió. Tocando uno se abre su globo con la dirección, la zona, cuánto compró y un enlace a la ficha.

### El fondo: foto o calles

El mapa arranca en **foto satelital** (Esri), que para esto es lo que sirve: una despensa de barrio se reconoce por el techo y la vereda, no por el nombre de la calle. Arriba a la derecha hay un selector para pasar a **Calles** (OpenStreetMap), que es lo que hay que usar para leer una dirección, porque la foto no trae los nombres. Los dos mapas del panel —el de la cartera y el de marcar el punto de un comercio— usan el mismo fondo, para que marcar la puerta en uno y buscarla en el otro se vea igual.

Si no carga **ninguna** imagen, el mapa lo dice en vez de quedar gris con los puntos flotando: el gris es el fondo de Leaflet cuando los azulejos no llegan, y sin aviso no hay forma de saber si es un problema de conexión, un bloqueador del navegador o que el pueblo no tiene fotos. El aviso espera unos segundos y solo aparece cuando no entró ni una: en los bordes del mapa siempre falla alguna y avisar por eso sería inventar un problema.

Abajo va el resumen **por zona**: cuántos comercios tiene cada parte del pueblo, a cuántos se visitó, cuántos compraron y cuánto se vendió. Eso es el estudio de mercado propiamente dicho — el mapa muestra *dónde*, la tabla muestra *cuánto*. Se arma sobre todos los comercios, tengan punto o no: uno existe aunque nadie le haya tomado todavía la ubicación.

### De dónde sale la ubicación

La toma el repartidor con el GPS del celular, parado en la puerta: en la pantalla del comercio hay un botón **Guardar ubicación**. Es exacto y no hay nada que tipear, y se va llenando solo en el recorrido de siempre. La alternativa era escribir cincuenta y tres direcciones y buscarlas una por una en un mapa, y muchas de estas despensas de barrio no figuran en ningún lado.

Detalles que importan:

- Si el GPS viene con más de 60 metros de error, **no se guarda** y avisa que salga a la vereda. Un punto de quinientos metros pondría el comercio a cinco cuadras y es peor que no tener nada, porque parece bueno y no lo es.
- Se puede volver a tomar cuantas veces haga falta: si el comercio se mudó, o si la primera lectura salió fea, se pisa la anterior.
- **Necesita señal**, y es lo único de la app del repartidor que no anda sin conexión. Una ubicación no es urgente: si no entra hoy entra mañana al pasar.
- El repartidor **no puede cambiar nada más** del comercio. La base solo deja escribir comercios al admin; para esto hay una función acotada (`guardar_ubicacion_comercio`) que toca exactamente la latitud, la longitud y la marca de cuándo se tomó, y que antes exige que quien llama sea un vendedor activo.

**El dueño también puede ponerla**, desde la ficha del comercio, de las tres formas que sirven según dónde esté cuando se acuerda: tocando la puerta en un mapa, con el botón de GPS si está parado ahí con el celular, o escribiendo las coordenadas si las copió de otro lado (la coma vale como punto decimal). Las tres llenan los mismos dos campos y guardan con el mismo botón. También se puede **sacar del mapa**: un punto mal puesto engaña más que uno que falta, porque el que arma el recorrido lo da por bueno y sale a buscar una puerta que no está ahí. Esto va por las RLS normales del admin y no por `guardar_ubicacion_comercio` — esa función existe para darle al repartidor un permiso que no tiene, y el admin ya puede escribir comercios.

### Las zonas las nombra el dueño

No hay agrupamiento automático: la zona es un campo de texto en la ficha del comercio (`Centro`, `La Loma`, `Ruta 3`…), con la lista de las que ya existen para elegir de ahí y no terminar con "centro" y "Centro" como si fueran dos. El dueño sabe qué es cada parte del pueblo mejor que cualquier algoritmo, y así puede cambiarlas cuando cambia el recorrido. Los que todavía no tienen una caen en **Sin zona**, que siempre va último porque es un cajón de pendientes y no una parte del pueblo.

También se puede cargar de una vez desde el Excel de importación, con una columna `zona` (o `barrio`, o `sector`).

### El mapa carga de afuera, los datos no

Las imágenes del mapa —las calles, las manzanas, el río— vienen de **OpenStreetMap**, que es gratis y no pide cuenta. Es lo único de todo el sistema que sale a internet: ese servidor solo ve qué pedazo del mundo se está mirando, nunca qué comercios hay ni qué pidieron. La biblioteca que dibuja (Leaflet) se sirve desde el propio dominio, no desde un CDN ajeno.

## La dirección, en vez del teléfono

El teléfono resultó no servir: de los cincuenta y tres comercios cargados solo catorce lo tenían, y para repartir no hace falta llamar sino saber llegar. La ficha pide ahora **dirección** (escrita como se diga en el pueblo: "Mitre 340", "Rivadavia y 7 de Marzo", "frente a la escuela 12") y **zona**.

La columna `telefono` **no se borró** de la base: los que estaban cargados son datos reales que alguien tomó y borrarlos no se puede deshacer. Simplemente salió de las pantallas, y editar una ficha no la pisa. Si algún día vuelve a hacer falta, el dato sigue ahí.

## QR de los comercios

Cada comercio tiene su cartel de 7×9 cm con el QR, el código y el nombre:

- **Uno solo**: desde la ficha del comercio, "Descargar para imprimir" (SVG, se imprime nítido a cualquier tamaño).
- **Todos, en PDF**: **Comercios → QR para imprimir → Descargar PDF**. Seis carteles por hoja A4 en tamaño real, con el QR, el código bien grande y el nombre abajo. Es lo más cómodo para llevar a una imprenta. `?incluir=todos` suma los comercios dados de baja.
- **Todos, desde el navegador**: la misma pantalla tiene el botón "Imprimir", que manda la hoja a la impresora de la máquina. Se recortan por la línea de puntos.

El QR guarda `LBM:<código>` como texto plano. No es un link: si alguien lo escanea con la cámara del celular no lo lleva a ningún lado, solo la app del vendedor lo entiende.

### El pedido se carga escaneando, y no de otra forma

El QR es la única prueba de que el repartidor estuvo parado en la puerta. Eligiendo el comercio de una lista, un pedido se puede cargar desde cualquier lado, y ahí "visitado" deja de querer decir nada. Así que el camino normal es escanear: desde la lista, el comercio muestra el candado y un botón que lleva a la cámara.

El candado tiene salida, porque un cartel despegado no puede costar una venta: se puede **seguir sin QR**, pero hay que escribir por qué (mínimo tres letras) y el pedido queda marcado como **sin QR** en el listado del panel, con el motivo a la vista en la ficha. La base también lo exige, así que no hay forma de saltearlo desde afuera de la app.

**La app abre en la cámara.** Escanear es el arranque de todo, así que abrir en el listado era un toque de más en lo único que el repartidor hace cincuenta veces por mañana. El listado queda en la segunda pestaña, para buscar un comercio o para cargar sin QR cuando el cartel no está.

El escáner anda sin señal: el código se resuelve contra la cartera guardada en el celular, y la pantalla se guarda en el celular apenas se abre la app con señal, antes de salir.

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
