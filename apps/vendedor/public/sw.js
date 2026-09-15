// Service worker mínimo, escrito a mano en vez de sumar una dependencia de
// PWA: lo único que necesita esta app es que el shell abra sin señal. Los
// datos ya viven en IndexedDB y la cola los sube sola.

const CACHE = "lbm-vendedor-v1";

// Los archivos de /_next/static van aparte porque se tratan distinto: llevan
// un hash en el nombre, así que cuando cambia el contenido cambia el nombre y
// el que ya está guardado sirve para siempre. Tenerlos en su propia caché
// permite podarlos sin tocar las pantallas guardadas para usar sin señal.
const ESTATICOS = "lbm-vendedor-estaticos-v1";
const VIGENTES = [CACHE, ESTATICOS];

// Cada deploy agrega su tanda de archivos y los viejos quedan sin uso. Con
// este tope entran varios deploys de historia y la caché no crece sin fin.
const MAX_ESTATICOS = 200;

/** Borra los estáticos más viejos. keys() los devuelve en orden de guardado,
 * o sea que los primeros son los de deploys anteriores. */
async function podarEstaticos() {
  const cache = await caches.open(ESTATICOS);
  const claves = await cache.keys();
  for (let i = 0; i < claves.length - MAX_ESTATICOS; i++) {
    await cache.delete(claves[i]);
  }
}

/** Caché primero: si el archivo está guardado se devuelve sin preguntar a la
 * red. Es lo que más se nota en la calle, donde la señal no falta del todo
 * pero anda mal: antes cada pedazo de la app esperaba a una conexión que
 * tardaba segundos en contestar, aunque ya lo tuviéramos guardado. */
async function estaticoGuardado(solicitud) {
  const cache = await caches.open(ESTATICOS);
  const guardado = await cache.match(solicitud);
  if (guardado) return guardado;

  const respuesta = await fetch(solicitud);
  if (respuesta.ok) {
    const copia = respuesta.clone();
    void cache.put(solicitud, copia);
  }
  return respuesta;
}

/** Lo que se ve al abrir la planilla sin señal: una pantalla que lo dice, en
 * vez del error del navegador en inglés. La descarga del Excel no es una
 * navegación, así que esa sí devuelve el error de red de siempre. */
function sinSenialParaLaPlanilla(solicitud) {
  if (solicitud.mode !== "navigate") return Response.error();
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width, initial-scale=1">
     <title>Sin señal</title>
     <style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;color:#1c1917;
       background:#fafaf9;display:flex;min-height:100vh;align-items:center;justify-content:center}
       div{max-width:22rem;text-align:center}h1{font-size:1.1rem;margin:0 0 .5rem}
       p{font-size:.9rem;color:#78716c;margin:0 0 1.25rem;line-height:1.5}
       a{display:inline-block;background:#1c1917;color:#fff;text-decoration:none;
         padding:.75rem 1.25rem;border-radius:.375rem;font-size:.95rem}</style></head>
     <body><div><h1>La planilla necesita señal</h1>
     <p>Son los pedidos de todos los comercios, así que salen del servidor y no
     del celular. Probá de nuevo cuando tengas conexión.</p>
     <a href="/planilla">Reintentar</a></div></body></html>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

// No se precachea nada en install: el service worker se registra cuando la
// app todavía está en el login, y ahí pedir /comercios devuelve el redirect
// del proxy, lo que hace fallar el install entero. Se guarda a medida que el
// vendedor navega con señal, que para el caso real (usar la app una vez en el
// local antes de salir a la calle) alcanza.
self.addEventListener("install", (evento) => {
  evento.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((c) => !VIGENTES.includes(c)).map((c) => caches.delete(c)))
      )
      .then(() => podarEstaticos())
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const solicitud = evento.request;
  if (solicitud.method !== "GET") return;

  const url = new URL(solicitud.url);
  if (url.origin !== self.location.origin) return;

  // Nunca cachear la autenticación ni las llamadas a la base: si se sirviera
  // una respuesta vieja de esas, la app mostraría datos o sesiones que ya no
  // valen.
  if (url.pathname.startsWith("/auth") || url.pathname.startsWith("/rest")) return;

  // La planilla tampoco. Es lo que hay que armar ahora, con los pedidos de
  // todos los comercios: servida de la caché se vería igualita a la de hoy
  // pero sería la de ayer, y con eso se preparan kilos de más o de menos. Sin
  // señal es mejor decirlo que mostrar algo que no se puede distinguir.
  if (url.pathname.startsWith("/planilla")) {
    evento.respondWith(fetch(solicitud).catch(() => sinSenialParaLaPlanilla(solicitud)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(estaticoGuardado(solicitud));
    return;
  }

  // El resto va red primero y caché de respaldo: con señal siempre se ve lo último, y sin
  // señal se abre igual con lo último que se vio.
  evento.respondWith(
    fetch(solicitud)
      .then((respuesta) => {
        // Las redirecciones no se guardan: cachear el 307 al login dejaría la
        // app mandando al login para siempre, incluso ya logueada.
        if (respuesta.ok && respuesta.type !== "opaqueredirect") {
          const copia = respuesta.clone();
          void caches.open(CACHE).then((cache) => cache.put(solicitud, copia));
        }
        return respuesta;
      })
      .catch(async () => {
        const enCache = await caches.match(solicitud);
        if (enCache) return enCache;

        // Navegación a una ruta que nunca se abrió con señal: se sirve el
        // listado de comercios, que es la pantalla principal.
        if (solicitud.mode === "navigate") {
          const respaldo = await caches.match("/comercios");
          if (respaldo) return respaldo;
        }
        return Response.error();
      })
  );
});
