// Service worker mínimo, escrito a mano en vez de sumar una dependencia de
// PWA: lo único que necesita esta app es que el shell abra sin señal. Los
// datos ya viven en IndexedDB y la cola los sube sola.

const CACHE = "lbm-vendedor-v1";

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
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
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

  // Red primero y caché de respaldo: con señal siempre se ve lo último, y sin
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
