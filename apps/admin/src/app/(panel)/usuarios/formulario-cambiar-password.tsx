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
      {/* El PIN y la contraseña son la misma credencial: cambiar una borra la
          otra. Sin avisarlo, el dueño se quedó afuera intentando un PIN que
          ya no existía. */}
      <p className="text-sm text-stone-600">
        Ojo: si tenés un PIN, al cambiar la contraseña <strong>el PIN deja de servir</strong>. Vas a
        tener que entrar con esta contraseña y cargarte un PIN nuevo.
      </p>
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
