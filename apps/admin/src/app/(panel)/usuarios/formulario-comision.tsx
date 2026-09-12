"use client";

import { useActionState } from "react";
import { BotonEnviar } from "@/components/boton-enviar";
import { Mensaje, estilos } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { cambiarComision } from "./actions";

export function FormularioComision({ id, valorActual }: { id: string; valorActual: number }) {
  const [estado, ejecutar] = useActionState(cambiarComision, ESTADO_INICIAL);

  return (
    <form action={ejecutar} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className={estilos.etiqueta}>Porcentaje</span>
          <div className="flex items-center gap-2">
            <input
              name="comision_pct"
              inputMode="decimal"
              defaultValue={String(valorActual)}
              className={`${estilos.input} w-28`}
              aria-label="Porcentaje de comisión"
            />
            <span className="text-sm text-stone-500">%</span>
          </div>
        </label>
        <BotonEnviar variante="secundario" confirmacion="El porcentaje nuevo se aplica a los pedidos que se carguen de ahora en más. Los pedidos ya hechos quedan con el porcentaje que tenían. ¿Guardamos?">
          Guardar
        </BotonEnviar>
      </div>

      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}
      {estado.ok ? <Mensaje tipo="ok">{estado.ok}</Mensaje> : null}
    </form>
  );
}
