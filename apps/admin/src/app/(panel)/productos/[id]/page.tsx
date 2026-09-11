import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonEliminar } from "@/components/boton-eliminar";
import { BotonEnviar } from "@/components/boton-enviar";
import { Etiqueta, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { actualizarProducto, cambiarEstadoProducto, eliminarProducto } from "../actions";
import { FormularioProducto } from "../formulario";

export default async function PaginaEditarProducto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { id } = await params;

  const { data: producto } = await supabase
    .from("productos")
    .select("id, nombre, precio, unidad_medida, activo")
    .eq("id", id)
    .maybeSingle();

  if (!producto) {
    notFound();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/productos" className="text-sm text-stone-500 underline hover:text-stone-900">
          ← Productos
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">{producto.nombre}</h1>
        <Etiqueta activo={producto.activo} />
      </div>

      <div className={`${estilos.tarjeta} p-5`}>
        <FormularioProducto
          accion={actualizarProducto}
          valores={producto}
          textoBoton="Guardar cambios"
        />
      </div>

      <div className={`${estilos.tarjeta} flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div>
          <p className="text-sm font-medium text-stone-900">
            {producto.activo ? "Dar de baja" : "Reactivar"}
          </p>
          <p className="text-sm text-stone-500">
            {producto.activo
              ? "Deja de aparecer en el catálogo del vendedor. Los pedidos viejos que lo incluyen no cambian."
              : "Vuelve a aparecer en el catálogo del vendedor."}
          </p>
        </div>
        <form action={cambiarEstadoProducto}>
          <input type="hidden" name="id" value={producto.id} />
          <input type="hidden" name="activo" value={producto.activo ? "false" : "true"} />
          <BotonEnviar
            variante="secundario"
            confirmacion={producto.activo ? `¿Dar de baja ${producto.nombre}?` : undefined}
          >
            {producto.activo ? "Dar de baja" : "Reactivar"}
          </BotonEnviar>
        </form>
      </div>

      <div className={`${estilos.tarjeta} flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div>
          <p className="text-sm font-medium text-stone-900">Eliminar producto</p>
          <p className="text-sm text-stone-500">
            Lo borra para siempre (a diferencia de dar de baja). Solo se puede si nunca se vendió.
          </p>
        </div>
        <BotonEliminar
          accion={eliminarProducto}
          id={producto.id}
          confirmacion={`Esto borra "${producto.nombre}" para siempre, no se puede deshacer. ¿Continuar?`}
        />
      </div>
    </>
  );
}
