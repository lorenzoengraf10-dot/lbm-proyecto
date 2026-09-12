"use client";

import type { Tabla } from "@lbm/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatearPrecio } from "@/lib/formato";
import { Mensaje, estilos } from "./ui";

export type ProductoCatalogo = Pick<Tabla<"productos">, "id" | "nombre" | "precio" | "unidad_medida">;

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
}) {
  const router = useRouter();
  const [cantidades, setCantidades] = useState<Record<string, string>>(cantidadesIniciales ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();

  // Lo que este comercio lleva siempre va primero: con casi veinte productos,
  // encontrar los cinco de siempre era scrollear toda la lista cada vez.
  const habituales = new Set((ultimoPedido ?? []).map((item) => item.producto_id));
  const ordenados =
    habituales.size === 0
      ? productos
      : [
          ...productos.filter((producto) => habituales.has(producto.id)),
          ...productos.filter((producto) => !habituales.has(producto.id)),
        ];

  function repetirUltimo() {
    if (!ultimoPedido) return;
    setCantidades(
      Object.fromEntries(ultimoPedido.map((item) => [item.producto_id, String(item.cantidad)]))
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
      {ultimoPedido && ultimoPedido.length > 0 ? (
        <button
          type="button"
          onClick={repetirUltimo}
          className={`w-full ${estilos.botonSecundario} py-2.5`}
        >
          Repetir lo de la vez pasada ({ultimoPedido.length}{" "}
          {ultimoPedido.length === 1 ? "producto" : "productos"})
        </button>
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

      <button
        type="button"
        disabled={pendiente || items.length === 0}
        onClick={guardar}
        className={`w-full ${estilos.boton}`}
      >
        {pendiente ? "Guardando…" : textoBoton}
      </button>
    </div>
  );
}
