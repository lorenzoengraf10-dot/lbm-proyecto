"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { AVISO_SIN_AZULEJOS, armarCapas } from "@lbm/shared/src/mapa-capas";

/** Carmen de Patagones, para centrar el mapa cuando todavía no hay puntos. */
const CENTRO_PATAGONES: [number, number] = [-40.7969, -62.9834];

export interface PuntoRepartidor {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  lat: number;
  lng: number;
  /** Si ya pasó hoy por ahí (con o sin pedido). */
  pasoHoy: boolean;
}

/**
 * Los dos estados, con su color. Lo que falta es lo que el repartidor sale a
 * buscar, así que es el punto grande y fuerte; lo hecho queda chico y verde.
 * Sin plata a propósito: el repartidor no ve montos (lo pidieron los dueños).
 */
export const ESTADOS_MAPA = {
  falta: { color: "#d97706", radio: 9, etiqueta: "Falta pasar hoy" },
  hecho: { color: "#15803d", radio: 6, etiqueta: "Ya pasé hoy" },
} as const;

/** Nada que venga de la base entra al globo sin escaparse primero. */
function escapar(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function globo(punto: PuntoRepartidor): string {
  // "Cómo llegar" abre el mapa del celular (Google Maps o el que tenga) con el
  // recorrido hasta la puerta. Es lo único que sale de la app, y solo cuando
  // el repartidor lo toca: viaja el punto de destino, nada más.
  const destino = `${punto.lat},${punto.lng}`;
  const comoLlegar = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`;
  return [
    `<strong>${escapar(punto.nombre)}</strong>`,
    escapar(punto.codigo) + (punto.direccion ? ` · ${escapar(punto.direccion)}` : ""),
    punto.pasoHoy ? "Ya pasaste hoy" : "Todavía no pasaste hoy",
    `<a href="${comoLlegar}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;font-weight:600">Cómo llegar</a>`,
  ].join("<br>");
}

/**
 * El mapa del repartidor: sus comercios, cuáles le faltan hoy y dónde está él.
 *
 * Leaflet se carga adentro del efecto y no arriba del archivo: toca window y
 * document al importarse, y en el prerender del servidor eso revienta. El mapa
 * se arma una sola vez y los puntos se redibujan aparte, así marcar una visita
 * no lo reinicia ni le cambia el zoom al repartidor.
 */
export function MapaRepartidor({
  puntos,
  hayConexion,
}: {
  puntos: PuntoRepartidor[];
  hayConexion: boolean;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const capaPuntos = useRef<import("leaflet").LayerGroup | null>(null);
  const capaYo = useRef<import("leaflet").LayerGroup | null>(null);
  const yaEncuadro = useRef(false);
  const [listo, setListo] = useState(false);
  const [sinAzulejos, setSinAzulejos] = useState(false);
  const [ubicando, setUbicando] = useState(false);
  const [avisoYo, setAvisoYo] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !contenedor.current) return;

      const mapa = L.map(contenedor.current).setView(CENTRO_PATAGONES, 14);
      const capas = armarCapas(L, () => setSinAzulejos(true));
      capas.inicial.addTo(mapa);
      capas.control.addTo(mapa);

      leafletRef.current = L;
      mapaRef.current = mapa;
      capaPuntos.current = L.layerGroup().addTo(mapa);
      capaYo.current = L.layerGroup().addTo(mapa);
      setListo(true);
    })();

    return () => {
      cancelado = true;
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const mapa = mapaRef.current;
    const capa = capaPuntos.current;
    if (!listo || !L || !mapa || !capa) return;

    capa.clearLayers();
    const marcas: import("leaflet").CircleMarker[] = [];
    // Los hechos primero: así los que faltan quedan dibujados arriba cuando
    // dos comercios están pegados.
    const ordenados = [...puntos].sort((a, b) => Number(b.pasoHoy) - Number(a.pasoHoy));
    for (const punto of ordenados) {
      const { color, radio } = ESTADOS_MAPA[punto.pasoHoy ? "hecho" : "falta"];
      const marca = L.circleMarker([punto.lat, punto.lng], {
        radius: radio,
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: punto.pasoHoy ? 0.75 : 0.95,
      })
        .bindPopup(globo(punto))
        // Escapado igual que el globo: bindTooltip escribe el texto como HTML.
        .bindTooltip(escapar(punto.nombre));
      marca.addTo(capa);
      marcas.push(marca);
    }

    // Encuadra una sola vez, al abrir: después el zoom es del repartidor.
    if (!yaEncuadro.current && marcas.length > 0) {
      yaEncuadro.current = true;
      if (marcas.length === 1) mapa.setView(marcas[0].getLatLng(), 16);
      else mapa.fitBounds(L.featureGroup(marcas).getBounds(), { padding: [30, 30] });
    }
  }, [puntos, listo]);

  function verDondeEstoy() {
    const L = leafletRef.current;
    const mapa = mapaRef.current;
    if (!L || !mapa || !capaYo.current) return;
    if (!navigator.geolocation) {
      setAvisoYo("Este celular no comparte la ubicación.");
      return;
    }
    setUbicando(true);
    setAvisoYo(null);
    // La posición se queda en el celular: solo se usa para dibujar el punto
    // azul. No se guarda ni se manda a ningún lado.
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        setUbicando(false);
        const { latitude, longitude, accuracy } = posicion.coords;
        const capa = capaYo.current;
        if (!capa) return;
        capa.clearLayers();
        L.circle([latitude, longitude], {
          radius: accuracy,
          color: "#2563eb",
          weight: 1,
          fillColor: "#2563eb",
          fillOpacity: 0.1,
        }).addTo(capa);
        L.circleMarker([latitude, longitude], {
          radius: 7,
          color: "#ffffff",
          weight: 3,
          fillColor: "#2563eb",
          fillOpacity: 1,
        })
          .bindTooltip("Estás acá")
          .addTo(capa);
        mapa.setView([latitude, longitude], Math.max(mapa.getZoom(), 16));
      },
      (error) => {
        setUbicando(false);
        setAvisoYo(
          error.code === error.PERMISSION_DENIED
            ? "El celular no dio permiso para ver la ubicación. Se activa en los ajustes del navegador."
            : "No se pudo encontrar dónde estás. Probá de nuevo en un lugar abierto."
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 }
    );
  }

  return (
    <div className="space-y-2">
      {/* Sin señal, el fondo no carga (las imágenes vienen de internet) pero
          los puntos sí, porque salen del celular. Decirlo así evita que
          parezca roto. */}
      {!hayConexion ? (
        <p className="rounded-md bg-stone-800 px-3 py-2 text-sm text-stone-100">
          Sin señal el fondo del mapa no carga, pero tus comercios se ven igual.
        </p>
      ) : sinAzulejos ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {AVISO_SIN_AZULEJOS}
        </p>
      ) : null}

      <div
        ref={contenedor}
        className="h-[60vh] min-h-72 w-full rounded-lg border border-stone-200"
        // Leaflet dibuja todo adentro con posición absoluta; sin esto, los
        // globos se salen de la tarjeta y tapan la barra de abajo.
        style={{ position: "relative", zIndex: 0 }}
      />

      <button
        type="button"
        onClick={verDondeEstoy}
        disabled={!listo || ubicando}
        className="w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-900 active:bg-stone-50 disabled:opacity-50"
      >
        {ubicando ? "Buscando dónde estás…" : "Ver dónde estoy"}
      </button>
      {avisoYo ? <p className="text-sm text-amber-800">{avisoYo}</p> : null}
    </div>
  );
}
