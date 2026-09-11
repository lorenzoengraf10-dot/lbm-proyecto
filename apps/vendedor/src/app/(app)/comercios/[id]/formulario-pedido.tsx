"use client";

import type { Tabla } from "@lbm/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mensaje, estilos } from "@/components/ui";
import { formatearPrecio } from "@/lib/formato";
import { crearPedido, type ItemPedido } from "../actions";

type Producto = Pick<Tabla<"productos">, "id" | "nombre" | "precio" | "unidad_medida">;

export function FormularioPedido({
  visitaId,
  productos,
}: {
  visitaId: string;
  productos: Producto[];
}) {
  const router = useRouter();
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();

  const items: ItemPedido[] = productos
    .map((producto) => ({
      productoId: producto.id,
      cantidad: Number(String(cantidades[producto.id] ?? "").replace(",", ".")),
    }))
    .filter((item) => item.cantidad > 0);

  const total = items.reduce((acumulado, item) => {
    const producto = productos.find((p) => p.id === item.productoId);
    return acumulado + (producto ? producto.precio * item.cantidad : 0);
  }, 0);

  function confirmar() {
    setError(null);
    iniciarTransicion(async () => {
      const resultado = await crearPedido(visitaId, items);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      router.push("/comercios");
      router.refresh();
    });
  }

  return (
    <div className={`${estilos.tarjeta} space-y-3 p-4`}>
      <p className="text-sm font-medium text-stone-900">Cargar pedido</p>

      {productos.length === 0 ? (
        <p className="text-sm text-stone-500">Todavía no hay productos activos en el catálogo.</p>
      ) : (
        <div className="space-y-2">
          {productos.map((producto) => (
            <div key={producto.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-stone-900">{producto.nombre}</p>
                <p className="text-xs text-stone-500">
                  {formatearPrecio(producto.precio)} / {producto.unidad_medida}
                </p>
              </div>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
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
        onClick={confirmar}
        className={`w-full ${estilos.boton}`}
      >
        {pendiente ? "Guardando…" : "Confirmar pedido"}
      </button>
    </div>
  );
}
