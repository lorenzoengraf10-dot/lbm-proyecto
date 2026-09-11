"use client";

import { useActionState } from "react";
import { BotonEnviar } from "@/components/boton-enviar";
import { Campo, Mensaje, estilos } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { cambiarMiPassword } from "./actions";

export function FormularioCambiarPassword() {
  const [estado, ejecutar] = useActionState(cambiarMiPassword, ESTADO_INICIAL);

  return (
    <form key={estado.nonce} action={ejecutar} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Contraseña nueva" ayuda="Al menos 6 caracteres.">
          <input
            name="nueva"
            type="password"
            minLength={6}
            required
            autoComplete="new-password"
            className={estilos.input}
          />
        </Campo>

        <Campo etiqueta="Repetila">
          <input
            name="confirmar"
            type="password"
            minLength={6}
            required
            autoComplete="new-password"
            className={estilos.input}
          />
        </Campo>
      </div>

      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}
      {estado.ok ? <Mensaje tipo="ok">{estado.ok}</Mensaje> : null}

      <BotonEnviar>Cambiar contraseña</BotonEnviar>
    </form>
  );
}
