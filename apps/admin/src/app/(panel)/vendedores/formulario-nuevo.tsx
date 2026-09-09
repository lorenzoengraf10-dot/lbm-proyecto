"use client";

import { useActionState } from "react";
import { BotonEnviar } from "@/components/boton-enviar";
import { Campo, Mensaje, estilos } from "@/components/ui";
import { crearVendedor } from "./actions";
import { AvisoCredencial } from "./credencial";
import { ESTADO_VENDEDOR_INICIAL } from "./tipos";

export function FormularioNuevoVendedor() {
  const [estado, ejecutar] = useActionState(crearVendedor, ESTADO_VENDEDOR_INICIAL);

  return (
    <div className="space-y-4">
      <form key={estado.ok ?? "nuevo"} action={ejecutar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre y apellido">
            <input name="nombre" required className={estilos.input} />
          </Campo>

          <Campo etiqueta="Usuario" ayuda="Con lo que entra a la app. Ej: juan. Sin espacios ni acentos.">
            <input
              name="username"
              required
              autoCapitalize="none"
              autoComplete="off"
              className={estilos.input}
            />
          </Campo>
        </div>

        {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}

        <BotonEnviar>Crear vendedor</BotonEnviar>
      </form>

      {estado.credencial ? <AvisoCredencial credencial={estado.credencial} /> : null}
    </div>
  );
}
