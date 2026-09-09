import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonEnviar } from "@/components/boton-enviar";
import { Etiqueta, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { formatearComision } from "@/lib/formato";
import { cambiarEstadoUsuario } from "../actions";
import { FormularioReset } from "../formulario-reset";

export default async function PaginaUsuario({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requerirAdmin();
  const { id } = await params;

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("id, nombre, username, rol, comision_pct, activo")
    .eq("id", id)
    .maybeSingle();

  if (!usuario) {
    notFound();
  }

  const esUnoMismo = usuario.id === userId;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/usuarios" className="text-sm text-stone-500 underline hover:text-stone-900">
          ← Usuarios
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">{usuario.nombre}</h1>
        <Etiqueta activo={usuario.activo} />
      </div>

      <div className={`${estilos.tarjeta} space-y-2 p-5 text-sm`}>
        <p>
          <span className="text-stone-500">Usuario: </span>
          <span className="font-mono">{usuario.username}</span>
        </p>
        <p>
          <span className="text-stone-500">Rol: </span>
          {usuario.rol === "admin" ? "Administrador" : "Vendedor"}
        </p>
        {usuario.rol === "vendedor" ? (
          <p>
            <span className="text-stone-500">Comisión: </span>
            {formatearComision(usuario.comision_pct)}
          </p>
        ) : null}
      </div>

      <div className={`${estilos.tarjeta} space-y-3 p-5`}>
        <div>
          <p className="text-sm font-medium text-stone-900">Credencial de acceso</p>
          <p className="text-sm text-stone-500">
            Sirve para configurar la app en un celular nuevo. Si se la olvidó o cambió de teléfono,
            generá una nueva acá.
          </p>
        </div>
        <FormularioReset id={usuario.id} nombre={usuario.nombre} />
      </div>

      <div className={`${estilos.tarjeta} flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div>
          <p className="text-sm font-medium text-stone-900">
            {usuario.activo ? "Dar de baja" : "Reactivar"}
          </p>
          <p className="text-sm text-stone-500">
            {esUnoMismo
              ? "No podés darte de baja a vos mismo."
              : usuario.activo
                ? "Pierde el acceso a la app. Las visitas y pedidos que ya cargó se mantienen."
                : "Vuelve a poder entrar a la app con su credencial."}
          </p>
        </div>
        {esUnoMismo ? null : (
          <form action={cambiarEstadoUsuario}>
            <input type="hidden" name="id" value={usuario.id} />
            <input type="hidden" name="activo" value={usuario.activo ? "false" : "true"} />
            <BotonEnviar
              variante="secundario"
              confirmacion={usuario.activo ? `¿Dar de baja a ${usuario.nombre}?` : undefined}
            >
              {usuario.activo ? "Dar de baja" : "Reactivar"}
            </BotonEnviar>
          </form>
        )}
      </div>
    </>
  );
}
