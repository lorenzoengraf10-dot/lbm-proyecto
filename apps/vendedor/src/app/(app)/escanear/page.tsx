"use client";

import { leerContenidoQr } from "@lbm/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useDatosLocales } from "@/components/datos-locales";
import { EscanerQr } from "@/components/escaner-qr";
import { Mensaje } from "@/components/ui";

type Lectura =
  | { estado: "esperando" }
  | { estado: "resolviendo" }
  | { estado: "encontrado"; comercioId: string }
  | { estado: "error"; texto: string };

/**
 * Qué significa lo que leyó la cámara, contra la cartera guardada en el
 * celular. Es una función pura de lo que hay en pantalla: así el resultado se
 * recalcula solo cuando termina de cargar la cartera, sin copiar nada a estado.
 */
function resolver(
  leido: string | null,
  cargando: boolean,
  comercios: { id: string; codigo: string }[]
): Lectura {
  if (leido === null) return { estado: "esperando" };

  // La cartera se lee del celular al abrir la pantalla y eso tarda un instante.
  // Si el QR ya estaba en cuadro, el código se resolvía contra una lista
  // todavía vacía y salía "no está en la cartera descargada" para un comercio
  // que sí estaba. Se espera a que llegue, y ahí se vuelve a resolver.
  if (cargando) return { estado: "resolviendo" };

  const codigo = leerContenidoQr(leido);
  if (!codigo) return { estado: "error", texto: "Ese código no es de La Buena Medida." };

  const comercio = comercios.find((c) => c.codigo === codigo);
  if (!comercio) {
    return {
      estado: "error",
      texto: `El código ${codigo} no está en la cartera descargada. Si es un comercio nuevo, abrí la app con señal para actualizarla.`,
    };
  }

  return { estado: "encontrado", comercioId: comercio.id };
}

export default function PaginaEscanear() {
  const router = useRouter();
  const { comercios, elegirComercio, cargando } = useDatosLocales();
  // Lo que leyó la cámara, crudo. El lector deja de escanear apenas decodifica
  // uno, así que esta es la única lectura que va a haber: entenderla es
  // responsabilidad de esta pantalla, no del lector.
  const [leido, setLeido] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  const lectura = resolver(leido, cargando, comercios);
  const comercioId = lectura.estado === "encontrado" ? lectura.comercioId : null;

  useEffect(() => {
    if (comercioId === null) return;
    elegirComercio(comercioId);
    router.push("/comercios");
  }, [comercioId, elegirComercio, router]);

  return (
    <>
      <h1 className="text-lg font-semibold text-stone-900">Escanear QR</h1>
      <p className="text-sm text-stone-500">Apuntá al cartel pegado en el comercio.</p>

      {lectura.estado === "error" ? (
        <div className="space-y-3">
          <Mensaje tipo="error">{lectura.texto}</Mensaje>
          <button
            type="button"
            onClick={() => {
              setLeido(null);
              setIntento((n) => n + 1);
            }}
            className="text-sm text-stone-600 underline"
          >
            Volver a intentar
          </button>
        </div>
      ) : lectura.estado === "esperando" ? (
        <EscanerQr key={intento} onDecodificado={setLeido} />
      ) : (
        // Leyó algo y lo está buscando, o ya lo encontró y está por saltar a la
        // pantalla del pedido. Decirlo, para que no parezca colgado.
        <p className="text-sm text-stone-500">Código leído. Buscándolo en la cartera…</p>
      )}
    </>
  );
}
