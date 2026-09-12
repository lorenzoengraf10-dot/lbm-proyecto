"use client";

import { useActionState } from "react";
import { LARGO_PIN } from "@lbm/shared";
import { BotonEnviar } from "@/components/boton-enviar";
import { Mensaje, estilos } from "@/components/ui";
import { fijarPin } from "./actions";
import { ESTADO_VENDEDOR_INICIAL } from "./tipos";

export function FormularioPin({ id, nombre }: { id: string; nombre: string }) {
  const [estado, ejecutar] = useActionState(fijarPin, ESTADO_VENDEDOR_INICIAL);

  return (
    <div className="space-y-4">
      <form action={ejecutar} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={id} />
        <label className="space-y-1 text-sm">
          <span className={estilos.etiqueta}>PIN de {LARGO_PIN} números</span>
          <input
            name="pin"
            inputMode="numeric"
            autoComplete="off"
            maxLength={LARGO_PIN}
            placeholder="483920"
            className={`${estilos.input} w-36 font-mono tracking-widest`}
          />
        </label>
        <BotonEnviar
          variante="secundario"
          confirmacion={`El PIN anterior de ${nombre} deja de servir y va a tener que entrar con el nuevo. ¿Seguimos?`}
        >
          Guardar PIN
        </BotonEnviar>
      </form>

      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}
      {estado.credencial ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            El PIN de {estado.credencial.usuario} quedó en:
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-widest text-amber-900">
            {estado.credencial.clave}
          </p>
          <p className="mt-3 text-sm text-amber-800">
            Pasáselo en persona o por WhatsApp. No queda guardado en ningún lado: si se lo olvida,
            le ponés uno nuevo desde acá.
          </p>
        </div>
      ) : null}
    </div>
  );
}
