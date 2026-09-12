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
