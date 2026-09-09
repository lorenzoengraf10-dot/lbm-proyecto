import Link from "next/link";
import { Desplegable } from "@/components/desplegable";
import { EstadoVacio, Etiqueta, SoloLectores, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { formatearComision } from "@/lib/formato";
import { FormularioNuevoVendedor } from "./formulario-nuevo";

export default async function PaginaVendedores() {
  const { supabase } = await requerirAdmin();

  const { data: usuarios, error } = await supabase
    .from("usuarios")
    .select("id, nombre, username, rol, comision_pct, activo")
    .order("rol")
    .order("nombre");

  return (
    <>
      <h1 className="text-xl font-semibold text-stone-900">Vendedores</h1>

      <Desplegable titulo="Dar de alta un vendedor">
        <FormularioNuevoVendedor />
      </Desplegable>

      <div className={`${estilos.tarjeta} overflow-hidden`}>
        {error ? (
          <EstadoVacio>No se pudieron cargar los usuarios: {error.message}</EstadoVacio>
        ) : (usuarios ?? []).length === 0 ? (
          <EstadoVacio>Todavía no hay usuarios cargados.</EstadoVacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  <th className={estilos.encabezadoCelda}>Nombre</th>
                  <th className={estilos.encabezadoCelda}>Usuario</th>
                  <th className={estilos.encabezadoCelda}>Rol</th>
                  <th className={estilos.encabezadoCelda}>Comisión</th>
                  <th className={estilos.encabezadoCelda}>Estado</th>
                  <th className={estilos.encabezadoCelda}>
                    <SoloLectores>Acciones</SoloLectores>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {(usuarios ?? []).map((usuario) => (
                  <tr key={usuario.id}>
                    <td className={`${estilos.celda} font-medium text-stone-900`}>
                      {usuario.nombre}
                    </td>
                    <td className={`${estilos.celda} font-mono`}>{usuario.username}</td>
                    <td className={estilos.celda}>
                      {usuario.rol === "admin" ? "Administrador" : "Vendedor"}
                    </td>
                    <td className={estilos.celda}>
                      {usuario.rol === "vendedor" ? formatearComision(usuario.comision_pct) : "—"}
                    </td>
                    <td className={estilos.celda}>
                      <Etiqueta activo={usuario.activo} />
                    </td>
                    <td className={`${estilos.celda} text-right`}>
                      <Link
                        href={`/vendedores/${usuario.id}`}
                        className="text-stone-600 underline hover:text-stone-900"
                      >
                        Administrar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
