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
      className={variante === "primario" ? estilos.boton : estilos.botonSecundario}
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}
