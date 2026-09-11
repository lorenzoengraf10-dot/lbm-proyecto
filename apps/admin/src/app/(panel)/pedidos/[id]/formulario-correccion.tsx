"use client";

import { useActionState } from "react";
import { BotonEnviar } from "@/components/boton-enviar";
import { Campo, Etiqueta, Mensaje, estilos } from "@/components/ui";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formularios";
import { formatearPrecio } from "@/lib/formato";

interface ProductoParaCorregir {
  id: string;
  nombre: string;
  unidad_medida: string;
  activo: boolean;
  precio: number;
  /** Cantidad y precio que tenía este ítem en el pedido, si estaba cargado. */
  cantidadActual: string;
  precioActual: string;
}

/**
 * Todo el catálogo con un campo de cantidad y uno de precio por producto,
 * como el que usa el vendedor para cargar un pedido — pero acá el precio se
 * puede tocar, porque una corrección no tiene por qué usar el precio de hoy.
 */
export function FormularioCorreccion({
  pedidoId,
  productos,
  accion,
}: {
  pedidoId: string;
  productos: ProductoParaCorregir[];
  accion: (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
}) {
  const [estado, ejecutar] = useActionState(accion, ESTADO_INICIAL);

  return (
    <form action={ejecutar} className="space-y-4">
      <input type="hidden" name="pedido_id" value={pedidoId} />

      <div className="space-y-2">
        {productos.map((producto) => (
          <div key={producto.id} className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-stone-900">
                {producto.nombre} {producto.activo ? null : <Etiqueta activo={false} />}
              </p>
              <p className="text-xs text-stone-500">
                {producto.unidad_medida} · precio de catálogo hoy: {formatearPrecio(producto.precio)}
              </p>
            </div>
            <label className="text-xs text-stone-500">
              Cantidad
              <input
                type="text"
                inputMode="decimal"
                name={`cantidad_${producto.id}`}
                defaultValue={producto.cantidadActual}
                placeholder="0"
                className={`mt-0.5 block w-20 ${estilos.input}`}
              />
            </label>
            <label className="text-xs text-stone-500">
              Precio unitario
              <input
                type="text"
                inputMode="decimal"
                name={`precio_${producto.id}`}
                defaultValue={producto.precioActual}
                className={`mt-0.5 block w-24 ${estilos.input}`}
              />
            </label>
          </div>
        ))}
      </div>

      <Campo
        etiqueta="Motivo de la corrección"
        ayuda="Una línea alcanza: qué estaba mal y qué se cambió. Queda guardado junto con la fecha."
      >
        <input name="motivo" required maxLength={300} className={estilos.input} />
      </Campo>

      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}
      {estado.ok ? <Mensaje tipo="ok">{estado.ok}</Mensaje> : null}

      <BotonEnviar confirmacion="Esto reemplaza los ítems del pedido y recalcula el total y la comisión. ¿Confirmás?">
        Guardar corrección
      </BotonEnviar>
    </form>
  );
}
