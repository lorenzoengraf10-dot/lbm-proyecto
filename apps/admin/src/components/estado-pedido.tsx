import {
  ESTADOS,
  ETIQUETA_ESTADO,
  type EstadoPedido,
  type FormaPago,
  estaImpago,
  textoCobro,
} from "@lbm/shared";

const COLOR: Record<EstadoPedido, string> = {
  pedido: "bg-stone-200 text-stone-700",
  preparado: "bg-amber-100 text-amber-800",
  completado: "bg-emerald-100 text-emerald-800",
};

/** El estado del pedido como pastilla de color, para las tablas. */
export function PastillaEstado({ estado }: { estado: EstadoPedido }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COLOR[estado]}`}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

/** Avisa que un pedido entregado quedó sin cobrar. */
export function PastillaImpago({
  formaPago,
  cobradoEn,
}: {
  formaPago: FormaPago | null;
  cobradoEn: string | null;
}) {
  if (!estaImpago(formaPago, cobradoEn)) return null;
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
      Sin cobrar
    </span>
  );
}

export function TextoCobro({
  estado,
  formaPago,
  cobradoEn,
}: {
  estado: EstadoPedido;
  formaPago: FormaPago | null;
  cobradoEn: string | null;
}) {
  return <>{textoCobro(estado, formaPago, cobradoEn)}</>;
}

/**
 * Los tres pasos en fila, con el actual marcado. Es la forma más rápida de
 * ver en qué anda un pedido sin leer texto.
 */
export function PasosEstado({ estado }: { estado: EstadoPedido }) {
  const actual = ESTADOS.indexOf(estado);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {ESTADOS.map((paso, indice) => (
        <li key={paso} className="flex items-center gap-1">
          <span
            className={`rounded-full px-2 py-1 font-medium ${
              indice <= actual ? COLOR[estado] : "bg-stone-100 text-stone-400"
            }`}
          >
            {ETIQUETA_ESTADO[paso]}
          </span>
          {indice < ESTADOS.length - 1 ? (
            <span aria-hidden className={indice < actual ? "text-stone-400" : "text-stone-300"}>
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
