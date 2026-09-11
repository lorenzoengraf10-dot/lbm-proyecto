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
      <BotonEnviar variante="secundario">Anular pedido</BotonEnviar>
      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}
    </form>
  );
}
