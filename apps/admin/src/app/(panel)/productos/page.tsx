import Link from "next/link";
import { Desplegable } from "@/components/desplegable";
import { EstadoVacio, Etiqueta, SoloLectores, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { formatearPrecio } from "@/lib/formato";
import { crearProducto } from "./actions";
import { FormularioProducto } from "./formulario";

export default async function PaginaProductos() {
  const { supabase } = await requerirAdmin();

  const { data: productos, error } = await supabase
    .from("productos")
    .select("id, nombre, precio, unidad_medida, activo")
    .order("nombre");

  return (
    <>
      <h1 className="text-xl font-semibold text-stone-900">Productos</h1>

      <Desplegable titulo="Agregar un producto">
        <FormularioProducto accion={crearProducto} textoBoton="Crear producto" limpiarAlGuardar />
      </Desplegable>

      <div className={`${estilos.tarjeta} overflow-hidden`}>
        {error ? (
          <EstadoVacio>No se pudieron cargar los productos: {error.message}</EstadoVacio>
        ) : (productos ?? []).length === 0 ? (
          <EstadoVacio>Todavía no hay productos en el catálogo.</EstadoVacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  <th className={estilos.encabezadoCelda}>Producto</th>
                  <th className={estilos.encabezadoCelda}>Precio</th>
                  <th className={estilos.encabezadoCelda}>Unidad</th>
                  <th className={estilos.encabezadoCelda}>Estado</th>
                  <th className={estilos.encabezadoCelda}>
                    <SoloLectores>Acciones</SoloLectores>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {(productos ?? []).map((producto) => (
                  <tr key={producto.id}>
                    <td className={`${estilos.celda} font-medium text-stone-900`}>
                      {producto.nombre}
                    </td>
                    <td className={estilos.celda}>{formatearPrecio(producto.precio)}</td>
                    <td className={estilos.celda}>{producto.unidad_medida}</td>
                    <td className={estilos.celda}>
                      <Etiqueta activo={producto.activo} />
                    </td>
                    <td className={`${estilos.celda} text-right`}>
                      <Link
                        href={`/productos/${producto.id}`}
                        className="text-stone-600 underline hover:text-stone-900"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-sm text-stone-500">
        {(productos ?? []).filter((p) => p.activo).length} productos activos de{" "}
        {productos?.length ?? 0}
      </p>
    </>
  );
}
