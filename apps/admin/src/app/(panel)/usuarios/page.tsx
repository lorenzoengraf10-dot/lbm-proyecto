import Link from "next/link";
import { Desplegable } from "@/components/desplegable";
import { Tabla } from "@/components/tabla";
import { EstadoVacio, Etiqueta, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { formatearComision } from "@/lib/formato";
import { FormularioNuevoUsuario } from "./formulario-nuevo";

export default async function PaginaUsuarios() {
  const { supabase } = await requerirAdmin();

  const { data: usuarios, error } = await supabase
    .from("usuarios")
    .select("id, nombre, username, rol, comision_pct, activo, pin_fijado_en")
    .order("rol")
    .order("nombre");

  return (
    <>
      <h1 className="text-xl font-semibold text-stone-900">Usuarios</h1>

      <Desplegable titulo="Dar de alta una cuenta">
        <FormularioNuevoUsuario />
      </Desplegable>

      {error ? (
        <div className={`${estilos.tarjeta} overflow-hidden`}>
          <EstadoVacio>No se pudieron cargar los usuarios: {error.message}</EstadoVacio>
        </div>
      ) : (
        <Tabla
          filas={usuarios ?? []}
          clave={(usuario) => usuario.id}
          vacio="Todavía no hay usuarios cargados."
          columnas={[
            {
              encabezado: "Nombre",
              principal: true,
              celda: (usuario) => (
                <Link href={`/usuarios/${usuario.id}`} className="hover:underline">
                  {usuario.nombre}
                </Link>
              ),
            },
            {
              encabezado: "Usuario",
              celda: (usuario) => <span className="font-mono">{usuario.username}</span>,
            },
            {
              encabezado: "Rol",
              celda: (usuario) => (usuario.rol === "admin" ? "Administrador" : "Vendedor"),
            },
            {
              encabezado: "Comisión",
              celda: (usuario) =>
                usuario.rol === "vendedor" ? formatearComision(usuario.comision_pct) : "—",
            },
            {
              encabezado: "Estado",
              celda: (usuario) => (
                <span className="flex flex-wrap items-center gap-1">
                  <Etiqueta activo={usuario.activo} />
                  {/* Sin PIN no puede entrar: es lo primero que hay que saber
                      de una cuenta recién creada. */}
                  {usuario.pin_fijado_en ? null : (
                    <span className="inline-flex whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Sin PIN
                    </span>
                  )}
                </span>
              ),
            },
            {
              encabezado: "Acciones",
              soloEscritorio: true,
              celda: (usuario) => (
                <Link
                  href={`/usuarios/${usuario.id}`}
                  className="text-stone-600 underline hover:text-stone-900"
                >
                  Administrar
                </Link>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
