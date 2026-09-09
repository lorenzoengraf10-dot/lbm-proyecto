"use client";

import { useActionState } from "react";
import { BotonEnviar } from "@/components/boton-enviar";
import { Mensaje } from "@/components/ui";
import { resetearCredencial } from "./actions";
import { AvisoCredencial } from "./credencial";
import { ESTADO_VENDEDOR_INICIAL } from "./tipos";

export function FormularioReset({ id, nombre }: { id: string; nombre: string }) {
  const [estado, ejecutar] = useActionState(resetearCredencial, ESTADO_VENDEDOR_INICIAL);

  return (
    <div className="space-y-4">
      <form action={ejecutar}>
        <input type="hidden" name="id" value={id} />
        <BotonEnviar
          variante="secundario"
          confirmacion={`Se va a generar una credencial nueva para ${nombre}. La anterior deja de servir. ¿Seguimos?`}
        >
          Generar credencial nueva
        </BotonEnviar>
      </form>

      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}
      {estado.credencial ? <AvisoCredencial credencial={estado.credencial} /> : null}
    </div>
  );
}
