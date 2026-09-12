"use client";

import { useEffect, useState, useTransition } from "react";
import { LARGO_PIN } from "@lbm/shared";
import { TecladoPin } from "@/components/teclado-pin";
import { Mensaje, estilos } from "@/components/ui";
import { entrarConPin, type Repartidor } from "./actions";

// Este celular es siempre del mismo repartidor: recordarlo evita el paso de
// elegir el nombre todos los días.
const CLAVE_RECORDADO = "lbm_vendedor_recordado";

export function FormularioLogin({ repartidores }: { repartidores: Repartidor[] }) {
  const [elegido, setElegido] = useState<Repartidor | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, empezar] = useTransition();

  useEffect(() => {
    // Quién viene preseleccionado depende de localStorage, que no existe en el
    // render del servidor: por eso se resuelve acá, ya montado, y no en el
    // useState. No es sincronizar con nada externo, es la inicialización que
    // solo puede pasar en el cliente.
    let recordado: Repartidor | null = null;
    try {
      const guardado = localStorage.getItem(CLAVE_RECORDADO);
      recordado = repartidores.find((r) => r.id === guardado) ?? null;
    } catch {
      // Sin localStorage se elige el nombre a mano, nada más.
    }
    // Un solo repartidor en el negocio: no tiene sentido hacerlo elegir.
    const inicial = recordado ?? (repartidores.length === 1 ? repartidores[0] : null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (inicial) setElegido(inicial);
  }, [repartidores]);

  function cambiarPin(nuevo: string) {
    setPin(nuevo);
    setError(null);
    if (nuevo.length !== LARGO_PIN || !elegido || entrando) return;

    // Se manda solo al completar los seis números, sin botón de por medio.
    empezar(async () => {
      const resultado = await entrarConPin(elegido.id, nuevo);
      // Si entró, la action redirige y esto no llega a correr.
      setPin("");
      setError(resultado.error);
    });
  }

  function elegir(repartidor: Repartidor) {
    setElegido(repartidor);
    setPin("");
    setError(null);
    try {
      localStorage.setItem(CLAVE_RECORDADO, repartidor.id);
    } catch {
      // Solo es una comodidad.
    }
  }

  function volverAElegir() {
    setElegido(null);
    setPin("");
    setError(null);
    try {
      localStorage.removeItem(CLAVE_RECORDADO);
    } catch {
      // Igual se sale de la pantalla.
    }
  }

  if (!elegido) {
    return (
      <div className="space-y-4">
        <p className="text-center text-sm text-stone-500">¿Quién sos?</p>
        <div className="space-y-2">
          {repartidores.length === 0 ? (
            <p className="text-center text-sm text-stone-500">
              Todavía no hay repartidores cargados. Avisale al dueño.
            </p>
          ) : (
            repartidores.map((repartidor) => (
              <button
                key={repartidor.id}
                type="button"
                onClick={() => elegir(repartidor)}
                className={`w-full ${estilos.botonSecundario} py-3 text-base`}
              >
                {repartidor.nombre}
                {repartidor.tienePin ? null : (
                  <span className="block text-xs font-normal text-stone-500">
                    todavía sin PIN
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-stone-500">Hola, {elegido.nombre}</p>
        <h1 className="text-lg font-semibold text-stone-900">Ingresá tu PIN</h1>
      </div>

      {elegido.tienePin ? null : (
        <Mensaje tipo="error">
          Todavía no tenés un PIN. Pedile al dueño que te lo cargue desde el panel.
        </Mensaje>
      )}

      <TecladoPin valor={pin} onCambiar={cambiarPin} largo={LARGO_PIN} disabled={entrando} />

      {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

      {repartidores.length > 1 ? (
        <button
          type="button"
          onClick={volverAElegir}
          className="w-full text-sm text-stone-500 underline hover:text-stone-900"
        >
          No soy {elegido.nombre}
        </button>
      ) : null}
    </div>
  );
}
