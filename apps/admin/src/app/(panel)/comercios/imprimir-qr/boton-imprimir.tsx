"use client";

import { estilos } from "@/components/ui";

export function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className={estilos.boton}>
      Imprimir
    </button>
  );
}
