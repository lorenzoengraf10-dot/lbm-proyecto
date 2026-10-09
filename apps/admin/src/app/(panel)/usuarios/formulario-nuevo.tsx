"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotonEnviar } from "@/components/boton-enviar";
import { Campo, Mensaje, estilos } from "@/components/ui";
import { crearUsuario } from "./actions";
import { AvisoCredencial } from "./credencial";
import { ESTADO_VENDEDOR_INICIAL } from "./tipos";

export function FormularioNuevoUsuario() {
  const [estado, ejecutar] = useActionState(crearUsuario, ESTADO_VENDEDOR_INICIAL);

  return (
    <div className="space-y-4">
      <form key={estado.ok ?? "nuevo"} action={ejecutar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Nombre y apellido">
            <input name="nombre" required className={estilos.input} />
          </Campo>

          <Campo etiqueta="Usuario" ayuda="Con lo que entra. Ej: juan. Sin espacios ni acentos.">
            <input
              name="username"
              required
              autoCapitalize="none"
              autoComplete="off"
              className={estilos.input}
            />
          </Campo>

          <Campo etiqueta="Rol" ayuda="El administrador ve todo; el vendedor solo usa la app.">
            <select name="rol" defaultValue="vendedor" required className={estilos.input}>
              <option value="vendedor">Vendedor / repartidor</option>
              <option value="admin">Administrador</option>
            </select>
          </Campo>
        </div>

        {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}

        <BotonEnviar>Crear cuenta</BotonEnviar>
      </form>

      {estado.repartidorNuevo ? (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">{estado.ok}</p>
          <Link
            href={`/usuarios/${estado.repartidorNuevo.id}`}
            className={`inline-block ${estilos.boton}`}
          >
            Cargarle el PIN a {estado.repartidorNuevo.nombre}
          </Link>
        </div>
      ) : null}
      {estado.credencial ? <AvisoCredencial credencial={estado.credencial} /> : null}
    </div>
  );
}
