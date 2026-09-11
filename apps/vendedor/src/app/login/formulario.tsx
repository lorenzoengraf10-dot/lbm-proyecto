"use client";

import { useActionState } from "react";
import { BotonEnviar } from "@/components/boton-enviar";
import { Campo, Mensaje, estilos } from "@/components/ui";
import { iniciarSesion, type EstadoLogin } from "./actions";

const ESTADO_INICIAL: EstadoLogin = { error: null };

export function FormularioLogin() {
  const [estado, accion] = useActionState(iniciarSesion, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <Campo etiqueta="Usuario">
        <input
          name="usuario"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          required
          className={estilos.input}
        />
      </Campo>

      <Campo etiqueta="Contraseña">
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={estilos.input}
        />
      </Campo>

      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}

      <BotonEnviar>Entrar</BotonEnviar>
    </form>
  );
}
