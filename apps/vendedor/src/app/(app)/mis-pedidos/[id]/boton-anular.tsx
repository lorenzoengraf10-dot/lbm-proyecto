"use client";

import { useActionState } from "react";
import { BotonEnviar } from "@/components/boton-enviar";
import { Mensaje } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { anularPedido } from "../actions";

export function BotonAnular({ id }: { id: string }) {
  const [estado, ejecutar] = useActionState(anularPedido, ESTADO_INICIAL);

  return (
    <form action={ejecutar} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {/* Anular borra el pedido entero y no tiene vuelta atrás: antes era un
          solo toque, y en el celular se toca sin querer. */}
      <BotonEnviar
        variante="secundario"
        confirmacion="¿Anular este pedido? Se borra entero y no se puede deshacer."
      >
        Anular pedido
      </BotonEnviar>
      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}
    </form>
  );
}
