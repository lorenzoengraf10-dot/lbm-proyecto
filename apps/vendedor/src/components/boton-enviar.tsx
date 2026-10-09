"use client";

import { useFormStatus } from "react-dom";
import { estilos } from "./ui";

export function BotonEnviar({
  children,
  variante = "primario",
  confirmacion,
}: {
  children: React.ReactNode;
  variante?: "primario" | "secundario";
  /** Si viene, se pregunta antes de enviar: para lo que no tiene vuelta atrás. */
  confirmacion?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={
        confirmacion
          ? (evento) => {
              if (!window.confirm(confirmacion)) evento.preventDefault();
            }
          : undefined
      }
      className={`w-full ${variante === "primario" ? estilos.boton : estilos.botonSecundario}`}
    >
      {pending ? "Un momento…" : children}
    </button>
  );
}
