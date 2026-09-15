"use client";

import { estilos, Mensaje } from "@/components/ui";

/**
 * Red de contención para cualquier error que se escape sin manejar en el
 * resto de la app (una consulta que falla, un dato inesperado). Sin este
 * archivo, Next muestra su pantalla genérica en inglés — "This page couldn't
 * load" — que a un repartidor en el local no le dice nada ni le sugiere qué
 * hacer. `retry` es el nombre del callback en esta versión de Next (antes se
 * llamaba `reset`).
 */
export default function ErrorPagina({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className={`${estilos.tarjeta} w-full max-w-xs space-y-4 p-6`}>
        <p className="text-center text-sm font-medium text-stone-900">La Buena Medida</p>
        <Mensaje tipo="error">Algo falló. Probá de nuevo, o avisale al dueño si sigue pasando.</Mensaje>
        <button type="button" onClick={() => retry()} className={`w-full ${estilos.boton}`}>
          Reintentar
        </button>
      </div>
    </main>
  );
}
