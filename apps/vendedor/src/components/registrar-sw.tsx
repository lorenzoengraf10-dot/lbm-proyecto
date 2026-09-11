"use client";

import { useEffect } from "react";

// Si el dueño publica una versión nueva mientras el repartidor tiene la app
// abierta, los pedazos de código que el celular todavía no bajó cambian de
// nombre y los viejos dejan de existir. La próxima pantalla que el vendedor
// abra falla con "This page couldn't load" y hay que recargar a mano.
//
// Recargar sola una vez arregla eso: la recarga trae el index nuevo, que
// apunta a los pedazos nuevos. La marca en sessionStorage es para que, si el
// error fuera por otra cosa, no quede recargándose en loop.
const MARCA_RECARGA = "lbm_recargado_por_version_nueva";

function esErrorDeVersionVieja(mensaje: string): boolean {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    mensaje
  );
}

async function recargarUnaVez() {
  try {
    if (sessionStorage.getItem(MARCA_RECARGA) === "1") return;
    sessionStorage.setItem(MARCA_RECARGA, "1");
  } catch {
    // Sin sessionStorage no hay forma de evitar el loop: mejor no recargar.
    return;
  }

  // El caché del service worker guarda el HTML viejo: sin limpiarlo, la
  // recarga vuelve a traer lo mismo.
  try {
    const claves = await caches.keys();
    await Promise.all(claves.map((clave) => caches.delete(clave)));
  } catch {
    // Si no se puede limpiar, la recarga igual suele alcanzar.
  }

  location.reload();
}

export function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Falla callado a propósito: si el navegador no deja registrarlo, la app
      // sigue andando con señal, solo pierde el arranque sin conexión.
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Recién después de un rato andando se borra la marca, para que una
    // publicación más tarde en el mismo turno también se arregle sola.
    // Borrarla al montar sería volver a habilitar la recarga antes de que
    // falle el mismo pedazo otra vez, y ahí sí quedaría en loop.
    const limpiarMarca = setTimeout(() => {
      try {
        sessionStorage.removeItem(MARCA_RECARGA);
      } catch {
        // Sin sessionStorage no hay marca que limpiar.
      }
    }, 30_000);

    const alFallarUnaCarga = (evento: ErrorEvent) => {
      if (esErrorDeVersionVieja(evento.message)) void recargarUnaVez();
    };
    const alRechazarUnaPromesa = (evento: PromiseRejectionEvent) => {
      if (esErrorDeVersionVieja(String(evento.reason?.message ?? evento.reason))) {
        void recargarUnaVez();
      }
    };

    window.addEventListener("error", alFallarUnaCarga);
    window.addEventListener("unhandledrejection", alRechazarUnaPromesa);
    return () => {
      clearTimeout(limpiarMarca);
      window.removeEventListener("error", alFallarUnaCarga);
      window.removeEventListener("unhandledrejection", alRechazarUnaPromesa);
    };
  }, []);

  return null;
}
