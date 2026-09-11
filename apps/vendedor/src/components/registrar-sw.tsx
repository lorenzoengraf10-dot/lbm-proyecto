"use client";

import { useEffect } from "react";

export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Falla callado a propósito: si el navegador no deja registrarlo, la app
    // sigue andando con señal, solo pierde el arranque sin conexión.
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
