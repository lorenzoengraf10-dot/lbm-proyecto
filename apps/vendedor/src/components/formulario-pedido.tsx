"use client";

import { formatearPrecio, type Tabla } from "@lbm/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mensaje, estilos } from "./ui";

export type ProductoCatalogo = Pick<Tabla<"productos">, "id" | "nombre" | "precio" | "unidad_medida">;

/**
 * Arriba de esta cantidad en un mismo producto, la app pregunta antes de
 * guardar. El caso real es la coma que no entró: escribir 2500 donde iba 2,5
 * arma un pedido de ocho millones de pesos, y hasta ahora se guardaba sin que
 * nadie dijera nada — entraba a los números del negocio y a la comisión del
 * repartidor como facturación de verdad.
 *
 * Pregunta, no bloquea: un comercio puede llevar 60 kg de una y ese pedido
 * tiene que poder cargarse igual, en un toque más.
 */
const CANTIDAD_QUE_HACE_DUDAR = 50;

export interface ItemPedido {
  productoId: string;
  cantidad: number;
}

export function FormularioPedido({
  productos,
  cantidadesIniciales,
  ultimoPedido,
  textoBoton,
  destino,
  onGuardar,
  onSinPedido,
}: {
  productos: ProductoCatalogo[];
  /** Para editar: cantidades ya cargadas, por id de producto. */
  cantidadesIniciales?: Record<string, string>;
  /** Lo que este comercio pidió la vez pasada, para poder repetirlo de un toque. */
  ultimoPedido?: { producto_id: string; cantidad: number }[];
  textoBoton: string;
  /** A dónde ir después de guardar. Si no se pasa, la pantalla se encarga. */
  destino?: string;
  onGuardar: (items: ItemPedido[]) => Promise<{ error: string | null }>;
  /** Registrar la visita sin pedido. Va acá adentro porque sólo este componente
   * sabe si hay cantidades cargadas que se perderían. */
  onSinPedido?: () => void;
}) {
  const router = useRouter();
  const [cantidades, setCantidades] = useState<Record<string, string>>(cantidadesIniciales ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();

  // Del último pedido solo se puede repetir lo que sigue en el catálogo: si el
  // dueño dio de baja un producto, esa línea ya no existe. Se cuenta aparte
  // para poder decirlo — prometer "repetir 5" y cargar 4 en silencio haría que
  // el repartidor confirme creyendo que está todo.
  const enCatalogo = new Set(productos.map((producto) => producto.id));
  const repetibles = (ultimoPedido ?? []).filter((item) => enCatalogo.has(item.producto_id));
  const dadosDeBaja = (ultimoPedido ?? []).length - repetibles.length;

  // Lo que este comercio lleva siempre va primero: con casi veinte productos,
  // encontrar los cinco de siempre era scrollear toda la lista cada vez.
  const habituales = new Set(repetibles.map((item) => item.producto_id));
  const ordenados =
    habituales.size === 0
      ? productos
      : [
          ...productos.filter((producto) => habituales.has(producto.id)),
          ...productos.filter((producto) => !habituales.has(producto.id)),
        ];

  function repetirUltimo() {
    setCantidades(
      Object.fromEntries(repetibles.map((item) => [item.producto_id, String(item.cantidad)]))
    );
  }

  const items: ItemPedido[] = ordenados
    .map((producto) => ({
      productoId: producto.id,
      cantidad: Number(String(cantidades[producto.id] ?? "").replace(",", ".")),
    }))
    .filter((item) => Number.isFinite(item.cantidad) && item.cantidad > 0);

  const total = items.reduce((acumulado, item) => {
    const producto = productos.find((p) => p.id === item.productoId);
    return acumulado + (producto ? Number(producto.precio) * item.cantidad : 0);
  }, 0);

  const nombrar = (productoId: string) => productos.find((p) => p.id === productoId);

  const exageradas = items
    .filter((item) => item.cantidad > CANTIDAD_QUE_HACE_DUDAR)
    .map((item) => {
      const producto = nombrar(item.productoId);
      return `${producto?.nombre ?? ""}: ${item.cantidad} ${producto?.unidad_medida ?? ""}`;
    });

  // La firma es "qué hay cargado ahora mismo". Sirve para que el aviso se
  // apague solo al corregir la cantidad, sin un efecto que sincronice estados:
  // si lo confirmado deja de coincidir con lo escrito, vuelve a preguntar.
  // Sin esto, confirmar 2500 y después escribir 5000 lo guardaba sin chistar.
  const firma = items.map((item) => `${item.productoId}:${item.cantidad}`).join("|");
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const preguntando = exageradas.length > 0 && confirmando === firma;

  function intentarGuardar() {
    setError(null);

    // cantidad es numeric(10,2) en la base: 0,004 se redondea a 0 y la base lo
    // rechaza con el nombre de la restricción en inglés. Se dice acá.
    const enCero = items.filter((item) => Math.round(item.cantidad * 100) / 100 < 0.01);
    if (enCero.length > 0) {
      setError("Hay una cantidad demasiado chica. La más chica que se puede cargar es 0,01.");
      return;
    }

    // subtotal también es numeric(10,2): arriba de 99.999.999,99 Postgres corta
    // con "numeric field overflow" y eso es lo que se leería en el celular.
    const noEntra = items.find((item) => {
      const precio = Number(nombrar(item.productoId)?.precio ?? 0);
      return item.cantidad * precio > 99_999_999.99;
    });
    if (noEntra) {
      setError(
        `${nombrar(noEntra.productoId)?.nombre ?? "Ese producto"}: esa cantidad es demasiado grande para cargarla. Fijate si se coló un cero de más.`
      );
      return;
    }

    if (exageradas.length > 0 && confirmando !== firma) {
      setConfirmando(firma);
      return;
    }

    guardar();
  }

  function guardar() {
    setError(null);
    iniciarTransicion(async () => {
      const resultado = await onGuardar(items);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      if (destino) {
        router.push(destino);
        router.refresh();
      }
    });
  }

  return (
    <div className={`${estilos.tarjeta} space-y-3 p-4`}>
      {/* Repetir lo de la vez pasada resuelve la mayoría de los pedidos de un
          toque: los comercios piden casi siempre lo mismo. */}
      {repetibles.length > 0 ? (
        <div className="space-y-1">
          <button
            type="button"
            onClick={repetirUltimo}
            className={`w-full ${estilos.botonSecundario} py-2.5`}
          >
            Repetir lo de la vez pasada ({repetibles.length}{" "}
            {repetibles.length === 1 ? "producto" : "productos"})
          </button>
          {dadosDeBaja > 0 ? (
            <p className="text-center text-xs text-stone-500">
              {dadosDeBaja === 1
                ? "Otro producto de ese pedido ya no está en el catálogo."
                : `Otros ${dadosDeBaja} productos de ese pedido ya no están en el catálogo.`}
            </p>
          ) : null}
        </div>
      ) : null}

      {productos.length === 0 ? (
        <p className="text-sm text-stone-500">Todavía no hay productos activos en el catálogo.</p>
      ) : (
        <div className="space-y-2">
          {ordenados.map((producto) => (
            <div key={producto.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-stone-900">
                  {producto.nombre}
                  {habituales.has(producto.id) ? (
                    <span className="ml-1 text-xs text-stone-400">· suele llevar</span>
                  ) : null}
                </p>
                <p className="text-xs text-stone-500">
                  {formatearPrecio(Number(producto.precio))} / {producto.unidad_medida}
                </p>
              </div>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                aria-label={`Cantidad de ${producto.nombre}`}
                value={cantidades[producto.id] ?? ""}
                onChange={(evento) =>
                  setCantidades((prev) => ({ ...prev, [producto.id]: evento.target.value }))
                }
                className="w-20 shrink-0 rounded-md border border-stone-300 px-2 py-1.5 text-right text-sm outline-none focus:border-stone-600"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-stone-100 pt-3">
        <span className="text-sm font-medium text-stone-900">Total</span>
        <span className="text-sm font-semibold text-stone-900">{formatearPrecio(total)}</span>
      </div>

      {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

      {preguntando ? (
        <Mensaje tipo="aviso">
          <span className="font-medium">Revisá estas cantidades antes de mandar:</span>
          <ul className="mt-1 list-disc pl-5">
            {exageradas.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
          <span className="mt-1 block">
            Si está bien, tocá de nuevo. Si no, corregí el número acá arriba.
          </span>
        </Mensaje>
      ) : null}

      <button
        type="button"
        disabled={pendiente || items.length === 0}
        onClick={intentarGuardar}
        className={`w-full ${estilos.boton}`}
      >
        {pendiente ? "Guardando…" : preguntando ? `Sí, está bien — ${textoBoton}` : textoBoton}
      </button>

      {onSinPedido ? (
        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            // Con cantidades ya escritas, tocar esto de más se llevaría el
            // pedido puesto sin dejar rastro: mejor preguntar.
            if (items.length > 0 && !confirm("Cargaste productos y se van a perder. ¿Registrar la visita sin pedido igual?")) {
              return;
            }
            onSinPedido();
          }}
          className="w-full py-1 text-center text-sm text-stone-500 underline"
        >
          Pasé pero no me pidió nada
        </button>
      ) : null}
    </div>
  );
}
