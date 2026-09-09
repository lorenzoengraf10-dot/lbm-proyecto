"use client";

import { useActionState } from "react";
import { BotonEnviar } from "@/components/boton-enviar";
import { Campo, Mensaje, estilos } from "@/components/ui";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formularios";

interface ValoresComercio {
  id?: string;
  codigo?: string;
  nombre?: string;
  localidad?: string;
  telefono?: string | null;
}

export function FormularioComercio({
  accion,
  valores,
  textoBoton,
  limpiarAlGuardar = false,
}: {
  accion: (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
  valores?: ValoresComercio;
  textoBoton: string;
  limpiarAlGuardar?: boolean;
}) {
  const [estado, ejecutar] = useActionState(accion, ESTADO_INICIAL);

  // Al crear conviene vaciar los campos tras el alta para poder cargar el
  // siguiente; al editar hay que conservar lo que se guardó.
  const claveFormulario = limpiarAlGuardar ? `alta-${estado.nonce}` : "edicion";

  return (
    <form key={claveFormulario} action={ejecutar} className="space-y-4">
      {valores?.id ? <input type="hidden" name="id" value={valores.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Código" ayuda="Se guarda en mayúsculas. Ej: CP1, V13.">
          <input
            name="codigo"
            defaultValue={valores?.codigo ?? ""}
            required
            maxLength={20}
            autoCapitalize="characters"
            className={`${estilos.input} uppercase`}
          />
        </Campo>

        <Campo etiqueta="Nombre">
          <input
            name="nombre"
            defaultValue={valores?.nombre ?? ""}
            required
            className={estilos.input}
          />
        </Campo>

        <Campo etiqueta="Localidad">
          <input
            name="localidad"
            defaultValue={valores?.localidad ?? ""}
            required
            className={estilos.input}
          />
        </Campo>

        <Campo etiqueta="Teléfono (opcional)">
          <input
            name="telefono"
            defaultValue={valores?.telefono ?? ""}
            className={estilos.input}
          />
        </Campo>
      </div>

      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}
      {estado.ok ? <Mensaje tipo="ok">{estado.ok}</Mensaje> : null}

      <BotonEnviar>{textoBoton}</BotonEnviar>
    </form>
  );
}
