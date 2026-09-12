"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { Mensaje, estilos } from "@/components/ui";
import { registrarCambioEstado } from "@/lib/sincronizacion";

type Aviso = { tipo: "ok" | "error"; texto: string } | null;

/**
 * Los botones para marcar el pedido en la calle. Van por la cola local, igual
 * que la carga de pedidos: si no hay señal el cambio queda anotado en el
 * celular y sube solo cuando vuelve, en vez de perderse o dar error.
 */
export function PanelEstado({
  pedidoId,
  estadoInicial,
  formaPagoInicial,
  cobradoEnInicial,
}: {
  pedidoId: string;
  estadoInicial: EstadoPedido;
  formaPagoInicial: FormaPago | null;
  cobradoEnInicial: string | null;
}) {
  // El estado se lleva en el cliente porque sin señal el servidor no se entera:
  // la pantalla tiene que reflejar lo que el vendedor acaba de marcar.
  const [estado, setEstado] = useState(estadoInicial);
  const [formaPago, setFormaPago] = useState(formaPagoInicial);
  const [cobradoEn, setCobradoEn] = useState(cobradoEnInicial);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  const siguiente = estadoSiguiente(estado);
  const anterior = estadoAnterior(estado);
  const impago = estaImpago(formaPago, cobradoEn);

  function marcar(nuevo: EstadoPedido, pago: FormaPago | null) {
    empezar(async () => {
      setAviso(null);
      const resultado = await registrarCambioEstado({
        pedidoId,
        estado: nuevo,
        formaPago: pago,
      });

      if (resultado.estado === "rechazado") {
        setAviso({ tipo: "error", texto: `No se pudo guardar: ${resultado.motivo}` });
        return;
      }

      setEstado(nuevo);
      setFormaPago(nuevo === "completado" ? pago : null);
      setCobradoEn(nuevo === "completado" && pago !== "cuenta_corriente" ? new Date().toISOString() : null);
      setAviso({
        tipo: "ok",
        texto:
          resultado.estado === "en-cola"
            ? "Guardado en el celular. Se sube solo cuando vuelva la señal."
            : `Pedido ${ETIQUETA_ESTADO[nuevo].toLowerCase()}.`,
      });
      // Solo se refresca si el cambio llegó al servidor. Sin señal, recargar
      // traería la página cacheada —con el estado viejo— y encima se llevaría
      // puesto el aviso de que quedó guardado en el celular.
      if (resultado.estado === "subido") router.refresh();
    });
  }

  function cobrar() {
    empezar(async () => {
      setAviso(null);
      const resultado = await registrarCambioEstado({
        pedidoId,
        estado: "completado",
        formaPago: "cuenta_corriente",
        cobrar: true,
      });

      if (resultado.estado === "rechazado") {
        setAviso({ tipo: "error", texto: `No se pudo cobrar: ${resultado.motivo}` });
        return;
      }

      setCobradoEn(new Date().toISOString());
      setAviso({
        tipo: "ok",
        texto:
          resultado.estado === "en-cola"
            ? "Cobro guardado en el celular. Se sube solo cuando vuelva la señal."
            : "Pedido cobrado.",
      });
      if (resultado.estado === "subido") router.refresh();
    });
  }

  return (
    <div className={`${estilos.tarjeta} space-y-3 p-4`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-stone-900">{ETIQUETA_ESTADO[estado]}</p>
        {estado === "completado" ? (
          <p className="text-sm text-stone-500">{textoCobro(estado, formaPago, cobradoEn)}</p>
        ) : null}
      </div>

      {siguiente === "completado" ? (
        <div className="space-y-2">
          <p className="text-sm text-stone-500">Al entregarlo, ¿cómo te pagaron?</p>
          <div className="grid gap-2">
            {FORMAS_PAGO.map((forma) => (
              <button
                key={forma}
                type="button"
                disabled={enviando}
                onClick={() => marcar("completado", forma)}
                className={`w-full ${forma === "cuenta_corriente" ? estilos.botonSecundario : estilos.boton}`}
              >
                {ETIQUETA_PAGO[forma]}
              </button>
            ))}
          </div>
        </div>
      ) : siguiente ? (
        <button
          type="button"
          disabled={enviando}
          onClick={() => marcar(siguiente, null)}
          className={`w-full ${estilos.boton}`}
        >
          Marcar como {ETIQUETA_ESTADO[siguiente].toLowerCase()}
        </button>
      ) : null}

      {impago ? (
        <button type="button" disabled={enviando} onClick={cobrar} className={`w-full ${estilos.boton}`}>
          Marcar como cobrado
        </button>
      ) : null}

      {anterior ? (
        <button
          type="button"
          disabled={enviando}
          onClick={() => marcar(anterior, null)}
          className={`w-full ${estilos.botonSecundario}`}
        >
          Volver a {ETIQUETA_ESTADO[anterior].toLowerCase()}
        </button>
      ) : null}

      {aviso ? <Mensaje tipo={aviso.tipo}>{aviso.texto}</Mensaje> : null}
    </div>
  );
}
