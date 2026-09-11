import Link from "next/link";
import { Desplegable } from "@/components/desplegable";
import { Tabla } from "@/components/tabla";
import { EstadoVacio, Etiqueta, estilos } from "@/components/ui";
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

      {error ? (
        <div className={`${estilos.tarjeta} overflow-hidden`}>
          <EstadoVacio>No se pudieron cargar los productos: {error.message}</EstadoVacio>
        </div>
      ) : (
        <Tabla
          filas={productos ?? []}
          clave={(producto) => producto.id}
          vacio="Todavía no hay productos en el catálogo."
          columnas={[
            {
              encabezado: "Producto",
              principal: true,
              celda: (producto) => (
                <Link href={`/productos/${producto.id}`} className="hover:underline">
                  {producto.nombre}
                </Link>
              ),
            },
            { encabezado: "Precio", celda: (producto) => formatearPrecio(Number(producto.precio)) },
            { encabezado: "Unidad", celda: (producto) => producto.unidad_medida },
            { encabezado: "Estado", celda: (producto) => <Etiqueta activo={producto.activo} /> },
            {
              encabezado: "Acciones",
              soloEscritorio: true,
              celda: (producto) => (
                <Link
                  href={`/productos/${producto.id}`}
                  className="text-stone-600 underline hover:text-stone-900"
                >
                  Editar
                </Link>
              ),
            },
          ]}
        />
      )}

      <p className="text-sm text-stone-500">
        {(productos ?? []).filter((p) => p.activo).length} productos activos de{" "}
        {productos?.length ?? 0}
      </p>
    </>
  );
}
