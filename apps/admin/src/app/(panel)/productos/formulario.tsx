"use client";

import { useActionState } from "react";
import { BotonEnviar } from "@/components/boton-enviar";
import { Campo, Mensaje, estilos } from "@/components/ui";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formularios";

const UNIDADES_SUGERIDAS = ["kg", "unidad", "docena", "bandeja"];

interface ValoresProducto {
  id?: string;
  nombre?: string;
  precio?: number;
  unidad_medida?: string;
}

export function FormularioProducto({
  accion,
  valores,
  textoBoton,
  limpiarAlGuardar = false,
}: {
  accion: (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
  valores?: ValoresProducto;
  textoBoton: string;
  limpiarAlGuardar?: boolean;
}) {
  const [estado, ejecutar] = useActionState(accion, ESTADO_INICIAL);
  const claveFormulario = limpiarAlGuardar ? `alta-${estado.nonce}` : "edicion";

  return (
    <form key={claveFormulario} action={ejecutar} className="space-y-4">
      {valores?.id ? <input type="hidden" name="id" value={valores.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <Campo etiqueta="Nombre">
            <input
              name="nombre"
              defaultValue={valores?.nombre ?? ""}
              required
              className={estilos.input}
            />
          </Campo>
        </div>

        <Campo etiqueta="Precio">
          <input
            name="precio"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={valores?.precio ?? ""}
            required
            className={estilos.input}
          />
        </Campo>

        <Campo etiqueta="Unidad de medida">
          <input
            name="unidad_medida"
            list="unidades-sugeridas"
            defaultValue={valores?.unidad_medida ?? ""}
            required
            className={estilos.input}
          />
        </Campo>
      </div>

      <datalist id="unidades-sugeridas">
        {UNIDADES_SUGERIDAS.map((unidad) => (
          <option key={unidad} value={unidad} />
        ))}
      </datalist>

      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}
      {estado.ok ? <Mensaje tipo="ok">{estado.ok}</Mensaje> : null}

      <BotonEnviar>{textoBoton}</BotonEnviar>
    </form>
  );
}
