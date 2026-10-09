"use client";

import { useEffect, useMemo, useState } from "react";
import { esDeHoy, rangoDeDias, diaArgentina } from "@lbm/shared";
import { useDatosLocales } from "@/components/datos-locales";
import { ESTADOS_MAPA, MapaRepartidor, type PuntoRepartidor } from "@/components/mapa-repartidor";
import { EstadoVacio, estilos } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase-browser";

/**
 * El mapa del repartidor: dónde queda cada comercio de la cartera y a cuáles
 * le falta pasar hoy, para armar el recorrido.
 *
 * Pantalla de cliente, como el resto de la app: los comercios y sus puntos
 * salen del catálogo guardado en el celular, así que los puntos se ven aunque
 * no haya señal (el fondo no, porque las imágenes vienen de internet).
 *
 * "Ya pasé hoy" junta dos cosas: las visitas de hoy que ya están en el
 * servidor (solo las suyas, por las RLS) y las que están en la cola del
 * celular esperando señal. Sin la segunda, un comercio recién visitado sin
 * señal seguiría marcado como pendiente.
 */
export default function PaginaMapa() {
  const { comercios, cola, cargando, hayConexion } = useDatosLocales();
  const [visitadosEnServidor, setVisitadosEnServidor] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!hayConexion) return;
    let vivo = true;
    const hoy = rangoDeDias(diaArgentina(), diaArgentina());
    void (async () => {
      const { data } = await crearClienteNavegador()
        .from("visitas")
        .select("comercio_id")
        .gte("fecha_hora", hoy.desdeIso)
        .lt("fecha_hora", hoy.hastaIso);
      // Si falla, queda lo que había: lo de la cola igual se ve.
      if (vivo && data) setVisitadosEnServidor(new Set(data.map((v) => v.comercio_id)));
    })();
    return () => {
      vivo = false;
    };
    // cola.length: al subir una visita de la cola, pasa a estar en el servidor.
  }, [hayConexion, cola.length]);

  const { puntos, sinUbicacion } = useMemo(() => {
    const pasoHoy = new Set(visitadosEnServidor);
    for (const pendiente of cola) {
      if (esDeHoy(pendiente.fechaHora)) pasoHoy.add(pendiente.comercioId);
    }

    const puntos: PuntoRepartidor[] = [];
    let sinUbicacion = 0;
    for (const comercio of comercios) {
      // typeof y no "!= null": el catálogo de una versión vieja de la app no
      // trae lng, y ahí llega undefined.
      if (typeof comercio.lat !== "number" || typeof comercio.lng !== "number") {
        sinUbicacion += 1;
        continue;
      }
      puntos.push({
        id: comercio.id,
        codigo: comercio.codigo,
        nombre: comercio.nombre,
        direccion: comercio.direccion,
        lat: comercio.lat,
        lng: comercio.lng,
        pasoHoy: pasoHoy.has(comercio.id),
      });
    }
    return { puntos, sinUbicacion };
  }, [comercios, cola, visitadosEnServidor]);

  if (cargando) {
    return <p className="text-sm text-stone-500">Cargando…</p>;
  }

  const faltan = puntos.filter((p) => !p.pasoHoy).length;

  return (
    <>
      <div>
        <h1 className="text-lg font-semibold text-stone-900">Mapa</h1>
        <p className="text-sm text-stone-500">
          {puntos.length === 0
            ? "Tus comercios, para armar el recorrido."
            : faltan === 0
              ? "Ya pasaste por todos los del mapa hoy."
              : `Te ${faltan === 1 ? "falta 1 comercio" : `faltan ${faltan} comercios`} por pasar hoy. Tocá un punto para ver cómo llegar.`}
        </p>
      </div>

      {/* La referencia arriba: es lo primero que hay que saber para leer el mapa. */}
      <div className="flex flex-wrap gap-4 text-sm">
        {Object.values(ESTADOS_MAPA).map(({ color, etiqueta }) => (
          <span key={etiqueta} className="flex items-center gap-2 text-stone-600">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full ring-2 ring-white"
              style={{ backgroundColor: color }}
            />
            {etiqueta}
          </span>
        ))}
      </div>

      {puntos.length === 0 ? (
        <div className={`${estilos.tarjeta} overflow-hidden`}>
          <EstadoVacio>
            {comercios.length === 0
              ? "Todavía no se descargó la cartera. Abrí la app una vez con señal."
              : "Todavía no hay comercios ubicados en el mapa. Cuando estés en la puerta de uno, entrá a cargarle el pedido y tocá “Guardar ubicación”."}
          </EstadoVacio>
        </div>
      ) : (
        <MapaRepartidor puntos={puntos} hayConexion={hayConexion} />
      )}

      {puntos.length > 0 && sinUbicacion > 0 ? (
        <p className="text-sm text-stone-500">
          {sinUbicacion === 1
            ? "1 comercio todavía no está en el mapa."
            : `${sinUbicacion} comercios todavía no están en el mapa.`}{" "}
          Cuando pases por la puerta, tocá “Guardar ubicación” al cargarle el pedido.
        </p>
      ) : null}
    </>
  );
}
