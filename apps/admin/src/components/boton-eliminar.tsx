"use client";

import { useActionState } from "react";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formularios";
import { BotonEnviar } from "./boton-enviar";
import { Mensaje } from "./ui";

export function BotonEliminar({
  accion,
  id,
  confirmacion,
}: {
  accion: (estadoPrevio: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
  id: string;
  confirmacion: string;
}) {
  const [estado, ejecutar] = useActionState(accion, ESTADO_INICIAL);

  return (
    <form action={ejecutar} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <BotonEnviar variante="peligro" confirmacion={confirmacion}>
        Eliminar definitivamente
      </BotonEnviar>
      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}
    </form>
  );
}
