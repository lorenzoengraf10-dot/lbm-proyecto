"use client";

import { useFormStatus } from "react-dom";
import { estilos } from "./ui";

export function BotonEnviar({
  children,
  variante = "primario",
}: {
  children: React.ReactNode;
  variante?: "primario" | "secundario";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-full ${variante === "primario" ? estilos.boton : estilos.botonSecundario}`}
    >
      {pending ? "Un momento…" : children}
    </button>
  );
}
