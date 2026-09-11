"use client";

import { leerContenidoQr } from "@lbm/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EscanerQr } from "@/components/escaner-qr";
import { Mensaje } from "@/components/ui";
import { registrarVisitaPorCodigo } from "../comercios/actions";

type Estado = "listo" | "procesando" | "error";

export default function PaginaEscanear() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("listo");
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  async function alDecodificar(texto: string) {
    const codigo = leerContenidoQr(texto);
    if (!codigo) {
      setError("Ese código no es de La Buena Medida.");
      setEstado("error");
      return;
    }

    setEstado("procesando");
    const resultado = await registrarVisitaPorCodigo(codigo);

    if (resultado.error || !resultado.comercioId) {
      setError(resultado.error ?? "No se pudo registrar la visita.");
      setEstado("error");
      return;
    }

    router.push(`/comercios/${resultado.comercioId}?visita=${resultado.visitaId ?? ""}`);
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
      ) : estado === "procesando" ? (
        <p className="text-sm text-stone-500">Registrando la visita…</p>
      ) : (
        <EscanerQr key={intento} onDecodificado={alDecodificar} />
      )}
    </>
  );
}
