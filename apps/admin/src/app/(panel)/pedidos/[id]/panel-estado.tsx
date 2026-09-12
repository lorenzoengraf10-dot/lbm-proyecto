"use client";

import { useActionState } from "react";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_PAGO,
  FORMAS_PAGO,
  type EstadoPedido,
  type FormaPago,
  estadoAnterior,
  estadoSiguiente,
  estaImpago,
  textoCobro,
} from "@lbm/shared";
import { BotonEnviar } from "@/components/boton-enviar";
import { PasosEstado } from "@/components/estado-pedido";
import { Mensaje, estilos } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { cambiarEstado, cobrarPedido } from "./actions";

export function PanelEstado({
  pedidoId,
  estado,
  formaPago,
  cobradoEn,
}: {
  pedidoId: string;
  estado: EstadoPedido;
  formaPago: FormaPago | null;
  cobradoEn: string | null;
}) {
  const [estadoForm, ejecutarEstado] = useActionState(cambiarEstado, ESTADO_INICIAL);
  const [estadoCobro, ejecutarCobro] = useActionState(cobrarPedido, ESTADO_INICIAL);

  const siguiente = estadoSiguiente(estado);
  const anterior = estadoAnterior(estado);
  const impago = estaImpago(formaPago, cobradoEn);

  return (
    <div className={`${estilos.tarjeta} space-y-4 p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-stone-900">Estado</p>
        <PasosEstado estado={estado} />
      </div>

      {estado === "completado" ? (
        <p className="text-sm text-stone-600">
          <span className="text-stone-500">Cobro: </span>
          {textoCobro(estado, formaPago, cobradoEn)}
        </p>
      ) : null}

      {/* Completar es el único paso que pide un dato más: cómo se cobró. Se
          muestran las tres formas como botones, así es un solo toque en vez
          de elegir en una lista y después confirmar. */}
      {siguiente === "completado" ? (
        <div className="space-y-2">
          <p className="text-sm text-stone-500">Al entregarlo, ¿cómo se cobró?</p>
          <div className="flex flex-wrap gap-2">
            {FORMAS_PAGO.map((forma) => (
              <form key={forma} action={ejecutarEstado}>
                <input type="hidden" name="pedido_id" value={pedidoId} />
                <input type="hidden" name="estado" value="completado" />
                <input type="hidden" name="forma_pago" value={forma} />
                <BotonEnviar variante={forma === "cuenta_corriente" ? "secundario" : "primario"}>
                  {ETIQUETA_PAGO[forma]}
                </BotonEnviar>
              </form>
            ))}
          </div>
        </div>
      ) : siguiente ? (
        <form action={ejecutarEstado}>
          <input type="hidden" name="pedido_id" value={pedidoId} />
          <input type="hidden" name="estado" value={siguiente} />
          <BotonEnviar>Marcar como {ETIQUETA_ESTADO[siguiente].toLowerCase()}</BotonEnviar>
        </form>
      ) : null}

      {impago ? (
        <form action={ejecutarCobro} className="border-t border-stone-100 pt-4">
          <input type="hidden" name="pedido_id" value={pedidoId} />
          <BotonEnviar>Marcar como cobrado</BotonEnviar>
        </form>
      ) : null}

      {anterior ? (
        <form action={ejecutarEstado} className="border-t border-stone-100 pt-4">
          <input type="hidden" name="pedido_id" value={pedidoId} />
          <input type="hidden" name="estado" value={anterior} />
          <div className="flex flex-wrap items-center gap-3">
            <BotonEnviar
              variante="secundario"
              confirmacion={
                estado === "completado"
                  ? "Volver atrás borra cómo se cobró este pedido y lo saca de las comisiones. ¿Seguimos?"
                  : undefined
              }
            >
              Volver a {ETIQUETA_ESTADO[anterior].toLowerCase()}
            </BotonEnviar>
            <span className="text-xs text-stone-500">Si lo marcaste por error.</span>
          </div>
        </form>
      ) : null}

      {estadoForm.error ? <Mensaje tipo="error">{estadoForm.error}</Mensaje> : null}
      {estadoForm.ok ? <Mensaje tipo="ok">{estadoForm.ok}</Mensaje> : null}
      {estadoCobro.error ? <Mensaje tipo="error">{estadoCobro.error}</Mensaje> : null}
      {estadoCobro.ok ? <Mensaje tipo="ok">{estadoCobro.ok}</Mensaje> : null}
    </div>
  );
}
