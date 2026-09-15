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
  direccion?: string | null;
  zona?: string | null;
}

export function FormularioComercio({
  accion,
  valores,
  textoBoton,
  limpiarAlGuardar = false,
  zonas = [],
}: {
  accion: (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
  valores?: ValoresComercio;
  textoBoton: string;
  limpiarAlGuardar?: boolean;
  /** Las zonas que ya existen, para elegir de la lista en vez de retipearlas. */
  zonas?: string[];
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

        <Campo
          etiqueta="Dirección (opcional)"
          ayuda="Como se diga en el pueblo: “Mitre 340”, “Rivadavia y 7 de Marzo”, “frente a la escuela 12”."
        >
          <input
            name="direccion"
            defaultValue={valores?.direccion ?? ""}
            maxLength={120}
            className={estilos.input}
          />
        </Campo>

        {/* Lista con las zonas que ya existen, pero el campo sigue siendo de
            texto: elegir una de la lista evita escribir "centro" y "Centro"
            como si fueran dos, y poder escribir una nueva evita tener que
            venir a crearla a otra pantalla antes. */}
        <Campo etiqueta="Zona (opcional)" ayuda="Para agrupar el recorrido y mirar el mapa por partes.">
          <input
            name="zona"
            list="zonas-cargadas"
            defaultValue={valores?.zona ?? ""}
            maxLength={40}
            className={estilos.input}
          />
          <datalist id="zonas-cargadas">
            {zonas.map((zona) => (
              <option key={zona} value={zona} />
            ))}
          </datalist>
        </Campo>
      </div>

      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}
      {estado.ok ? <Mensaje tipo="ok">{estado.ok}</Mensaje> : null}

      <BotonEnviar>{textoBoton}</BotonEnviar>
    </form>
  );
}
