"use client";

import { useState } from "react";
import { estilos } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase-browser";

/** Más de esto y el punto no sirve para distinguir un local del de al lado. */
const PRECISION_MAXIMA_METROS = 60;
const ESPERA_MAXIMA_MS = 20_000;

type Estado =
  | { paso: "quieto" }
  | { paso: "buscando" }
  | { paso: "ok"; metros: number }
  | { paso: "error"; texto: string };

/**
 * Guarda dónde queda el comercio, tomando el punto del GPS del celular.
 *
 * Se toma parado en la puerta, que es cuando el repartidor está ahí de todas
 * formas: es exacto y no hay nada que tipear. La alternativa era que el dueño
 * escribiera 53 direcciones y las buscara una por una en un mapa, y muchas de
 * estas despensas de barrio no figuran en ningún lado.
 *
 * Necesita señal: es lo único de la app del repartidor que no anda sin
 * conexión. Se podría encolar como los pedidos, pero una ubicación no es
 * urgente —si no entra hoy entra mañana al pasar— y encolarla traería toda la
 * complejidad de la cola para algo que se hace una vez por comercio en la vida.
 */
export function BotonUbicacion({
  comercioId,
  yaTiene,
  hayConexion,
  alGuardar,
}: {
  comercioId: string;
  /** Si ya se le tomó antes: cambia el texto, pero se puede volver a tomar. */
  yaTiene: boolean;
  hayConexion: boolean;
  alGuardar?: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ paso: "quieto" });
  // Al comercio que ya está en el mapa no hay que volver a tomarle el punto
  // nunca más, pero el botón seguía ocupando el lugar de arriba del pedido —
  // que es la pantalla que el repartidor abre cincuenta veces por mañana. Se
  // guarda detrás de una línea chica y se despliega solo si hace falta
  // (se mudó el comercio, o la primera lectura salió fea).
  const [desplegado, setDesplegado] = useState(false);

  function tomar() {
    if (!navigator.geolocation) {
      setEstado({ paso: "error", texto: "Este celular no comparte la ubicación." });
      return;
    }

    setEstado({ paso: "buscando" });
    navigator.geolocation.getCurrentPosition(
      async (posicion) => {
        const { latitude, longitude, accuracy } = posicion.coords;

        // Una lectura de 500 metros pondría el comercio a cinco cuadras, que
        // para armar un recorrido es peor que no tener nada: se guardaría un
        // punto que parece bueno y no lo es.
        if (accuracy > PRECISION_MAXIMA_METROS) {
          setEstado({
            paso: "error",
            texto: `La señal del GPS está débil (± ${Math.round(accuracy)} m). Salí a la vereda y probá de nuevo.`,
          });
          return;
        }

        const { error } = await crearClienteNavegador().rpc("guardar_ubicacion_comercio", {
          p_comercio_id: comercioId,
          p_lat: Number(latitude.toFixed(6)),
          p_lng: Number(longitude.toFixed(6)),
        });

        if (error) {
          setEstado({ paso: "error", texto: `No se pudo guardar: ${error.message}` });
          return;
        }
        setEstado({ paso: "ok", metros: Math.round(accuracy) });
        alGuardar?.();
      },
      (error) => {
        // El navegador devuelve un código y un mensaje en inglés; acá se
        // traduce a lo que el repartidor puede hacer al respecto.
        const textos: Record<number, string> = {
          1: "Le dijiste que no al permiso de ubicación. Habilitalo en los ajustes del navegador para este sitio.",
          2: "No se pudo tomar la ubicación. Probá afuera, que adentro del local el GPS no engancha.",
          3: "Tardó demasiado en encontrar la señal. Probá de nuevo en la vereda.",
        };
        setEstado({
          paso: "error",
          texto: textos[error.code] ?? "No se pudo tomar la ubicación.",
        });
      },
      { enableHighAccuracy: true, timeout: ESPERA_MAXIMA_MS, maximumAge: 0 }
    );
  }

  const buscando = estado.paso === "buscando";
  const yaEsta = (yaTiene || estado.paso === "ok") && !desplegado && estado.paso !== "error";

  if (yaEsta) {
    return (
      <p className="text-xs text-stone-400">
        {estado.paso === "ok" ? "Ubicación guardada." : "Este comercio ya está en el mapa."}{" "}
        <button
          type="button"
          onClick={() => setDesplegado(true)}
          className="underline hover:text-stone-600"
        >
          Volver a tomarla
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={tomar}
        disabled={buscando || !hayConexion}
        className={`w-full ${estilos.botonSecundario}`}
      >
        {buscando
          ? "Buscando el GPS…"
          : yaTiene || estado.paso === "ok"
            ? "Volver a tomar la ubicación"
            : "Guardar ubicación"}
      </button>

      {!hayConexion ? (
        <p className="text-xs text-stone-400">La ubicación se guarda con señal. Tomala al volver.</p>
      ) : estado.paso === "ok" ? (
        <p className="text-xs text-green-700">
          Ubicación guardada (± {estado.metros} m). Ya se ve en el mapa del panel.
        </p>
      ) : estado.paso === "error" ? (
        <p className="text-xs text-red-700">{estado.texto}</p>
      ) : (
        <p className="text-xs text-stone-400">
          {yaTiene
            ? "Este comercio ya está en el mapa."
            : "Tocalo parado en la puerta: queda el punto exacto y no hay que escribir nada."}
        </p>
      )}
    </div>
  );
}
