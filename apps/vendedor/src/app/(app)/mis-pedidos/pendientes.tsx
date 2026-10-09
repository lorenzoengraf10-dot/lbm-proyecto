"use client";

import { useDatosLocales } from "@/components/datos-locales";
import { Mensaje, estilos } from "@/components/ui";
import { formatearFechaHora } from "@lbm/shared";
import { descartarRechazado } from "@/lib/sincronizacion";

/** Lo que todavía está en el celular sin subir, arriba de los ya guardados. */
export function PedidosPendientes() {
  const { cola, colaAjena, hayConexion, recargar } = useDatosLocales();

  if (cola.length === 0 && colaAjena === 0) return null;

  // Pedidos de otro repartidor que usó este celular: no se tocan. Antes se
  // borraban en silencio al entrar otro; decirlo es lo que evita que alguien
  // los dé por perdidos y los vuelva a cargar.
  const avisoAjenos =
    colaAjena > 0 ? (
      <Mensaje tipo="aviso">
        En este celular hay {colaAjena} {colaAjena === 1 ? "pedido" : "pedidos"} de otro
        repartidor sin subir. Se suben cuando él vuelva a entrar con señal; no hace falta cargarlos
        de nuevo.
      </Mensaje>
    ) : null;

  if (cola.length === 0) return avisoAjenos;

  return (
    <div className={`${estilos.tarjeta} space-y-3 p-4`}>
      {avisoAjenos}
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
            {pendiente.error ? (
              <div className="mt-1 space-y-1">
                <Mensaje tipo="error">{pendiente.error}</Mensaje>
                {/* Lo rechazado no se arregla reintentando: hay que poder
                    sacarlo. Lo que solo espera señal no lleva este botón. */}
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !confirm(
                        `¿Descartar este ${pendiente.pedidoId ? "pedido" : "registro de visita"} de ${pendiente.comercioNombre}? No se va a subir.`
                      )
                    ) {
                      return;
                    }
                    await descartarRechazado(pendiente.visitaId);
                    await recargar();
                  }}
                  className="text-xs text-stone-500 underline"
                >
                  Descartar
                </button>
              </div>
            ) : null}
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
