"use client";

import { useState, type ReactNode } from "react";
import { estilos } from "./ui";

/**
 * Un <details> nativo se vuelve a cerrar cuando la página se re-renderiza tras
 * guardar, y con él se esconde el mensaje de "listo". Manteniendo el estado en
 * React el formulario queda abierto y vacío, listo para cargar el siguiente.
 */
export function Desplegable({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className={estilos.tarjeta}>
      <button
        type="button"
        onClick={() => setAbierto((valor) => !valor)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 p-5 text-left text-sm font-medium text-stone-700"
      >
        <span aria-hidden className="text-xs text-stone-400">
          {abierto ? "▼" : "▶"}
        </span>
        {titulo}
      </button>
      {abierto ? <div className="px-5 pb-5">{children}</div> : null}
    </div>
  );
}
