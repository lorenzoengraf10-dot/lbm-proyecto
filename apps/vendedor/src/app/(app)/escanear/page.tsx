"use client";

import { leerContenidoQr } from "@lbm/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDatosLocales } from "@/components/datos-locales";
import { EscanerQr } from "@/components/escaner-qr";
import { Mensaje } from "@/components/ui";

type Estado = "listo" | "error";

export default function PaginaEscanear() {
  const router = useRouter();
  const { comercios, elegirComercio } = useDatosLocales();
  const [estado, setEstado] = useState<Estado>("listo");
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  // El código se resuelve contra el catálogo guardado en el celular, así que
  // escanear funciona igual sin señal.
  function alDecodificar(texto: string) {
    const codigo = leerContenidoQr(texto);
    if (!codigo) {
      setError("Ese código no es de La Buena Medida.");
      setEstado("error");
      return;
    }

    const comercio = comercios.find((c) => c.codigo === codigo);
    if (!comercio) {
      setError(
        `El código ${codigo} no está en la cartera descargada. Si es un comercio nuevo, abrí la app con señal para actualizarla.`
      );
      setEstado("error");
      return;
    }

    elegirComercio(comercio.id);
    router.push("/comercios");
  }

  return (
    <>
      <h1 className="text-lg font-semibold text-stone-900">Escanear QR</h1>
      <p className="text-sm text-stone-500">Apuntá al cartel pegado en el comercio.</p>

      {estado === "error" ? (
        <div className="space-y-3">
          {error ? <Mensaje tipo="error">{error}</Mensaje> : null}
          <button
            type="button"
            onClick={() => {
              setEstado("listo");
              setError(null);
              setIntento((n) => n + 1);
            }}
            className="text-sm text-stone-600 underline"
          >
            Volver a intentar
          </button>
        </div>
      ) : (
        <EscanerQr key={intento} onDecodificado={alDecodificar} />
      )}
    </>
  );
}
