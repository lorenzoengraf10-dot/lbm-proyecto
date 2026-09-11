"use client";

import { useDatosLocales } from "@/components/datos-locales";
import { Mensaje, estilos } from "@/components/ui";
import { formatearFechaHora } from "@/lib/formato";

/** Lo que todavía está en el celular sin subir, arriba de los ya guardados. */
export function PedidosPendientes() {
  const { cola, hayConexion, recargar } = useDatosLocales();

  if (cola.length === 0) return null;

  return (
    <div className={`${estilos.tarjeta} space-y-3 p-4`}>
      <div>
        <p className="text-sm font-medium text-stone-900">
          {cola.length} sin subir todavía
        </p>
        <p className="text-sm text-stone-500">
          {hayConexion
            ? "Se están subiendo. Si alguno queda trabado, va a decir por qué."
            : "Se suben solos cuando vuelva la señal. Podés seguir trabajando."}
        </p>
      </div>

      <ul className="space-y-2">
        {cola.map((pendiente) => (
          <li key={pendiente.visitaId} className="text-sm">
            <span className="font-medium text-stone-900">{pendiente.comercioNombre}</span>
            <span className="text-stone-500">
              {" · "}
              {formatearFechaHora(pendiente.fechaHora)}
              {pendiente.pedidoId ? "" : " · solo visita"}
            </span>
            {pendiente.error ? <Mensaje tipo="error">{pendiente.error}</Mensaje> : null}
          </li>
        ))}
      </ul>

      {hayConexion ? (
        <button
          type="button"
          onClick={() => void recargar()}
          className={`w-full ${estilos.botonSecundario}`}
        >
          Reintentar ahora
        </button>
      ) : null}
    </div>
  );
}
