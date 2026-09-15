"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { COLORES, type PuntoComercio } from "@/lib/mapa";

const formatoPesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/** Nada que venga de la base entra al popup sin escaparse primero. */
function escapar(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function globo(punto: PuntoComercio): string {
  const partes = [
    `<strong>${escapar(punto.codigo)} · ${escapar(punto.nombre)}</strong>` +
      // Puede aparecer uno dado de baja si vendió durante el período: sin
      // decirlo, se leería como un comercio que sigue andando.
      (punto.activo ? "" : " <em>(dado de baja)</em>"),
    punto.direccion ? escapar(punto.direccion) : null,
    punto.zona ? `Zona: ${escapar(punto.zona)}` : null,
    punto.estado === "pidio"
      ? `${punto.pedidos} ${punto.pedidos === 1 ? "pedido" : "pedidos"} · ${formatoPesos.format(punto.totalPesos)}`
      : punto.estado === "visitado"
        ? `${punto.visitas} ${punto.visitas === 1 ? "visita" : "visitas"}, sin pedido`
        : "Sin visitar en este período",
    `<a href="/comercios/${escapar(punto.id)}" style="text-decoration:underline">Ver la ficha</a>`,
  ];
  return partes.filter(Boolean).join("<br>");
}

/**
 * El mapa con un punto por comercio.
 *
 * Leaflet se carga adentro del efecto y no arriba del archivo: toca window y
 * document al importarse, y en el prerender del servidor eso revienta.
 *
 * Los puntos son círculos dibujados (circleMarker) y no los chinches que trae
 * Leaflet: los chinches son archivos de imagen que hay que resolver a mano con
 * el empaquetador, y encima acá el color es el dato — que haya vendido o no es
 * justamente lo que se viene a ver.
 */
export function MapaComercios({
  puntos,
  centro,
}: {
  puntos: PuntoComercio[];
  centro: { lat: number; lng: number };
}) {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contenedor.current) return;
    let mapa: import("leaflet").Map | null = null;
    let cancelado = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !contenedor.current) return;

      mapa = L.map(contenedor.current, { scrollWheelZoom: false }).setView(
        [centro.lat, centro.lng],
        14
      );

      // Los azulejos del mapa son lo único que sale a internet. Nunca viaja
      // qué comercios hay ni qué pidieron: el servidor de mapas solo ve qué
      // pedazo del mundo se está mirando.
      //
      // La atribución es obligatoria por las condiciones de uso de
      // OpenStreetMap, así que no se saca.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapa);

      const dibujados: import("leaflet").CircleMarker[] = [];
      for (const punto of puntos) {
        if (punto.lat === null || punto.lng === null) continue;
        const { color, radio } = COLORES[punto.estado];
        const marca = L.circleMarker([punto.lat, punto.lng], {
          radius: radio,
          color: "#ffffff",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9,
        })
          .bindPopup(globo(punto))
          // Para que se pueda encontrar uno por el nombre pasando el mouse,
          // sin tener que abrir globo por globo. Escapado igual que el globo:
          // bindTooltip escribe el texto como HTML, así que un nombre con un
          // "<" rompería el mapa entero.
          .bindTooltip(`${escapar(punto.codigo)} · ${escapar(punto.nombre)}`);
        marca.addTo(mapa!);
        dibujados.push(marca);
      }

      // Encuadra para que entren todos, en vez de dejar la mitad afuera. Con
      // uno solo, fitBounds haría un acercamiento absurdo, así que ahí se deja
      // el zoom fijo.
      if (dibujados.length > 1) {
        mapa.fitBounds(L.featureGroup(dibujados).getBounds(), { padding: [30, 30] });
      }
    })();

    return () => {
      cancelado = true;
      mapa?.remove();
    };
  }, [puntos, centro]);

  return (
    <div
      ref={contenedor}
      className="h-[70vh] min-h-80 w-full rounded-lg border border-stone-200"
      // Leaflet dibuja todo adentro con posición absoluta; sin esto, los
      // globos se salen de la tarjeta.
      style={{ position: "relative", zIndex: 0 }}
    />
  );
}
