"use client";

import { useFormStatus } from "react-dom";
import { estilos } from "./ui";

const CLASES_VARIANTE = {
  primario: estilos.boton,
  secundario: estilos.botonSecundario,
  peligro: estilos.botonPeligro,
} as const;

export function BotonEnviar({
  children,
  variante = "primario",
  confirmacion,
}: {
  children: React.ReactNode;
  variante?: keyof typeof CLASES_VARIANTE;
  confirmacion?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={confirmacion ? (evento) => {
        if (!window.confirm(confirmacion)) evento.preventDefault();
      } : undefined}
      className={CLASES_VARIANTE[variante]}
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}
