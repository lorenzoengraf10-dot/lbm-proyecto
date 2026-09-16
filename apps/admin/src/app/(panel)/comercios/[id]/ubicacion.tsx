"use client";

import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { BotonEnviar } from "@/components/boton-enviar";
import { estilos } from "@/components/ui";
import { CENTRO_PATAGONES } from "@/lib/mapa";
import { AVISO_SIN_AZULEJOS, armarCapas } from "@/lib/mapa-capas";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { guardarUbicacionComercio } from "../actions";

/** Más de esto y el punto no distingue un local del de al lado. */
const PRECISION_MAXIMA_METROS = 60;
const ESPERA_MAXIMA_MS = 20_000;

type Punto = { lat: number; lng: number };

/** Seis decimales son ~10 cm: lo que aguanta la columna y de sobra para una puerta. */
function redondear(valor: number): string {
  return valor.toFixed(6);
}

/**
 * El mapa donde se marca el punto tocando la calle.
 *
 * Leaflet se importa adentro del efecto, no arriba del archivo: toca window al
 * cargarse y en el prerender del servidor eso revienta.
 */
function MapaElegirPunto({
  punto,
  alElegir,
}: {
  punto: Punto | null;
  alElegir: (punto: Punto) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [sinAzulejos, setSinAzulejos] = useState(false);
  // El mapa se arma una sola vez; mover la marca después no lo rearma, porque
  // rearmarlo perdería el zoom y el encuadre justo mientras se está buscando
  // la puerta.
  const marca = useRef<import("leaflet").CircleMarker | null>(null);

  useEffect(() => {
    if (!contenedor.current) return;
    let mapa: import("leaflet").Map | null = null;
    let cancelado = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !contenedor.current) return;

      // Sin punto todavía, se abre sobre el pueblo y bastante cerca: el que
      // marca ya sabe dónde queda, lo que necesita es ver las calles.
      mapa = L.map(contenedor.current).setView(
        punto ? [punto.lat, punto.lng] : [CENTRO_PATAGONES.lat, CENTRO_PATAGONES.lng],
        punto ? 17 : 14
      );

      // Arranca en foto: para marcar la puerta de una despensa de barrio, ver
      // el techo y la vereda sirve mil veces más que el dibujo de la calle.
      const capas = armarCapas(L, () => setSinAzulejos(true));
      capas.inicial.addTo(mapa);
      capas.control.addTo(mapa);

      const dibujar = (donde: Punto) => {
        if (!mapa) return;
        if (marca.current) {
          marca.current.setLatLng([donde.lat, donde.lng]);
          return;
        }
        marca.current = L.circleMarker([donde.lat, donde.lng], {
          radius: 9,
          color: "#ffffff",
          weight: 3,
          fillColor: "#b45309",
          fillOpacity: 0.95,
        }).addTo(mapa);
      };

      if (punto) dibujar(punto);

      mapa.on("click", (evento: import("leaflet").LeafletMouseEvent) => {
        const elegido = { lat: evento.latlng.lat, lng: evento.latlng.lng };
        dibujar(elegido);
        alElegir(elegido);
      });
    })();

    return () => {
      cancelado = true;
      marca.current = null;
      mapa?.remove();
    };
    // `punto` queda afuera a propósito: es solo el valor inicial, y volver a
    // armar el mapa cada vez que se mueve la marca perdería el zoom y el
    // encuadre justo mientras se está buscando la puerta. `alElegir` viene
    // estable del padre, así que no lo rearma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alElegir]);

  return (
    <div className="space-y-2">
      {/* Acá avisar importa todavía más que en el mapa de la cartera: sobre un
          cuadro gris no hay forma de saber dónde se está tocando. */}
      {sinAzulejos ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {AVISO_SIN_AZULEJOS} Mientras tanto podés escribir las coordenadas acá abajo.
        </p>
      ) : null}
      <div
        ref={contenedor}
        className="h-72 w-full rounded-md border border-stone-200"
        // Leaflet posiciona todo con absolute; sin esto se sale de la tarjeta.
        style={{ position: "relative", zIndex: 0 }}
      />
    </div>
  );
}

type EstadoGps =
  | { paso: "quieto" }
  | { paso: "buscando" }
  | { paso: "error"; texto: string };

/**
 * Poner el comercio en el mapa desde el panel, de las tres formas que sirven
 * según dónde esté el dueño cuando se acuerda de hacerlo:
 *
 *   * tocando la calle en el mapa, sentado en la computadora,
 *   * con el GPS, si está parado en la puerta con el celular,
 *   * escribiendo las coordenadas, que es lo que queda cuando las copió de
 *     otro lado.
 *
 * Las tres escriben en los mismos dos campos y guardan con el mismo botón: no
 * son tres formularios, es uno con tres maneras de llenarlo.
 */
export function UbicacionComercio({
  comercioId,
  lat,
  lng,
}: {
  comercioId: string;
  lat: number | null;
  lng: number | null;
}) {
  const [estado, accion] = useActionState(guardarUbicacionComercio, ESTADO_INICIAL);
  const [gps, setGps] = useState<EstadoGps>({ paso: "quieto" });
  const idLat = useId();
  const idLng = useId();

  const inicial = lat !== null && lng !== null ? { lat, lng } : null;
  const [texto, setTexto] = useState({
    lat: inicial ? redondear(inicial.lat) : "",
    lng: inicial ? redondear(inicial.lng) : "",
  });

  function tomarConGps() {
    if (!navigator.geolocation) {
      setGps({ paso: "error", texto: "Este navegador no comparte la ubicación." });
      return;
    }
    setGps({ paso: "buscando" });
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        const { latitude, longitude, accuracy } = posicion.coords;
        // Una lectura de 500 metros deja el comercio a cinco cuadras: parece
        // un punto bueno y no lo es, que es peor que no tener ninguno.
        if (accuracy > PRECISION_MAXIMA_METROS) {
          setGps({
            paso: "error",
            texto: `La señal está débil (± ${Math.round(accuracy)} m). Salí a la vereda y probá de nuevo, o marcalo en el mapa.`,
          });
          return;
        }
        setTexto({ lat: redondear(latitude), lng: redondear(longitude) });
        setGps({ paso: "quieto" });
      },
      (error) => {
        const textos: Record<number, string> = {
          1: "Le dijiste que no al permiso de ubicación. Habilitalo para este sitio en los ajustes del navegador.",
          2: "No se pudo tomar la ubicación. Adentro del local el GPS no engancha: probá en la vereda o marcalo en el mapa.",
          3: "Tardó demasiado en encontrar la señal. Probá de nuevo o marcalo en el mapa.",
        };
        setGps({ paso: "error", texto: textos[error.code] ?? "No se pudo tomar la ubicación." });
      },
      { enableHighAccuracy: true, timeout: ESPERA_MAXIMA_MS, maximumAge: 0 }
    );
  }

  // Estable a propósito: es lo que deja que el mapa se arme una sola vez.
  const alElegirEnElMapa = useCallback((p: Punto) => {
    setTexto({ lat: redondear(p.lat), lng: redondear(p.lng) });
    setGps({ paso: "quieto" });
  }, []);

  const hayPunto = texto.lat.trim() !== "" && texto.lng.trim() !== "";

  return (
    <div className="space-y-3">
      <MapaElegirPunto punto={inicial} alElegir={alElegirEnElMapa} />
      <p className="text-xs text-stone-500">
        Tocá la puerta del comercio en el mapa. Si estás parado ahí con el celular, el botón de
        abajo lo toma solo.
      </p>

      <form action={accion} className="space-y-3">
        <input type="hidden" name="id" value={comercioId} />

        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1 text-sm">
            <span className={estilos.etiqueta} id={idLat}>
              Latitud
            </span>
            <input
              name="lat"
              aria-labelledby={idLat}
              inputMode="decimal"
              value={texto.lat}
              onChange={(e) => setTexto((t) => ({ ...t, lat: e.target.value }))}
              placeholder="-40.796900"
              className={`${estilos.input} w-40`}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className={estilos.etiqueta} id={idLng}>
              Longitud
            </span>
            <input
              name="lng"
              aria-labelledby={idLng}
              inputMode="decimal"
              value={texto.lng}
              onChange={(e) => setTexto((t) => ({ ...t, lng: e.target.value }))}
              placeholder="-62.983400"
              className={`${estilos.input} w-40`}
            />
          </label>

          <button
            type="button"
            onClick={tomarConGps}
            disabled={gps.paso === "buscando"}
            className={estilos.botonSecundario}
          >
            {gps.paso === "buscando" ? "Buscando el GPS…" : "Usar mi ubicación"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <BotonEnviar>{inicial ? "Guardar el punto nuevo" : "Guardar la ubicación"}</BotonEnviar>
          {!hayPunto ? (
            <span className="text-xs text-stone-400">
              Marcá el punto en el mapa, o escribí las dos coordenadas.
            </span>
          ) : null}
        </div>

        {gps.paso === "error" ? <p className="text-sm text-red-700">{gps.texto}</p> : null}
        {estado.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}
        {estado.ok ? <p className="text-sm text-green-700">{estado.ok}</p> : null}
      </form>

      {inicial ? (
        // Un punto mal puesto engaña más que uno que falta: el que arma el
        // recorrido lo da por bueno y sale a buscar una puerta que no está ahí.
        <form action={accion}>
          <input type="hidden" name="id" value={comercioId} />
          <input type="hidden" name="quitar" value="1" />
          <BotonEnviar
            variante="peligro"
            confirmacion="¿Sacar este comercio del mapa? Se puede volver a marcar cuando quieras."
          >
            Sacarlo del mapa
          </BotonEnviar>
        </form>
      ) : null}
    </div>
  );
}
