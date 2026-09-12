import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonEliminar } from "@/components/boton-eliminar";
import { BotonEnviar } from "@/components/boton-enviar";
import { Etiqueta, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { formatearComision, formatearPrecio } from "@/lib/formato";
import { cambiarEstadoUsuario, eliminarUsuario } from "../actions";
import { FormularioComision } from "../formulario-comision";
import { FormularioCambiarPassword } from "../formulario-cambiar-password";
import { FormularioPin } from "../formulario-pin";
import { FormularioReset } from "../formulario-reset";

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string | number; detalle?: string }) {
  return (
    <div>
      <p className="text-sm text-stone-500">{titulo}</p>
      <p className="text-lg font-semibold text-stone-900">{valor}</p>
      {detalle ? <p className="text-xs text-stone-500">{detalle}</p> : null}
    </div>
  );
}

export default async function PaginaUsuario({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requerirAdmin();
  const { id } = await params;

  // El perfil y su actividad en la misma tanda: son consultas independientes.
  const [{ data: usuario }, { data: pedidos }, { count: visitas }] = await Promise.all([
    supabase.from("usuarios").select("id, nombre, username, rol, comision_pct, activo").eq("id", id).maybeSingle(),
    supabase.from("pedidos").select("total, comision_pct, estado").eq("vendedor_id", id),
    supabase.from("visitas").select("id", { count: "exact", head: true }).eq("vendedor_id", id),
  ]);

  if (!usuario) {
    notFound();
  }

  const esUnoMismo = usuario.id === userId;

  // La comisión sale del porcentaje congelado en cada pedido, no del que el
  // vendedor tiene hoy: si el dueño se lo cambió, lo ya ganado no se mueve.
  // Y solo cuentan los completados, que son los entregados y cobrados.
  const completados = (pedidos ?? []).filter((p) => p.estado === "completado");
  const vendido = completados.reduce((total, p) => total + Number(p.total), 0);
  const ganado = completados.reduce(
    (total, p) => total + (Number(p.total) * Number(p.comision_pct)) / 100,
    0
  );
  const sinCompletar = (pedidos ?? []).length - completados.length;

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
            <span className="text-stone-500">Comisión actual: </span>
            {formatearComision(usuario.comision_pct)}
          </p>
        ) : null}
      </div>

      {usuario.rol === "vendedor" ? (
        <>
          <div className={`${estilos.tarjeta} space-y-4 p-5`}>
            <p className="text-sm font-semibold text-stone-900">Cómo viene</p>
            <div className="grid gap-4 sm:grid-cols-4">
              <Dato titulo="Visitas" valor={visitas ?? 0} />
              <Dato titulo="Pedidos entregados" valor={completados.length} />
              <Dato titulo="Vendido" valor={formatearPrecio(vendido)} />
              <Dato
                titulo="Comisión ganada"
                valor={formatearPrecio(ganado)}
                detalle="con el porcentaje de cada pedido"
              />
            </div>
            {sinCompletar > 0 ? (
              <p className="text-sm text-stone-500">
                {sinCompletar} {sinCompletar === 1 ? "pedido suyo todavía no está" : "pedidos suyos todavía no están"}{" "}
                entregado{sinCompletar === 1 ? "" : "s"}: no cuenta{sinCompletar === 1 ? "" : "n"} para la comisión.
              </p>
            ) : null}
          </div>

          <div className={`${estilos.tarjeta} space-y-3 p-5`}>
            <div>
              <p className="text-sm font-medium text-stone-900">Cambiar la comisión</p>
              <p className="text-sm text-stone-500">
                El porcentaje nuevo se aplica a los pedidos que {usuario.nombre} cargue de acá en
                adelante. Los pedidos que ya hizo quedan con el porcentaje que tenían, así no se
                mueven las comisiones ya pagadas ni los reportes viejos.
              </p>
            </div>
            <FormularioComision id={usuario.id} valorActual={Number(usuario.comision_pct)} />
          </div>
        </>
      ) : null}

      <div className={`${estilos.tarjeta} space-y-3 p-5`}>
        {esUnoMismo ? (
          <>
            <div>
              <p className="text-sm font-medium text-stone-900">Cambiar mi contraseña</p>
              <p className="text-sm text-stone-500">Elegí vos la contraseña nueva.</p>
            </div>
            <FormularioCambiarPassword />
          </>
        ) : (
          usuario.rol === "vendedor" ? (
            <>
              <div>
                <p className="text-sm font-medium text-stone-900">PIN de acceso</p>
                <p className="text-sm text-stone-500">
                  Con esto entra a la app: elige su nombre y escribe el PIN. Si se lo olvida o se lo
                  ve alguien, le ponés uno nuevo acá y el anterior deja de servir.
                </p>
              </div>
              <FormularioPin id={usuario.id} nombre={usuario.nombre} />
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-stone-900">Credencial de acceso</p>
                <p className="text-sm text-stone-500">
                  Sirve para entrar al panel. Si se la olvidó, generá una nueva acá.
                </p>
              </div>
              <FormularioReset id={usuario.id} nombre={usuario.nombre} />
            </>
          )
        )}
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

      {esUnoMismo ? null : (
        <div className={`${estilos.tarjeta} flex flex-wrap items-center justify-between gap-3 p-5`}>
          <div>
            <p className="text-sm font-medium text-stone-900">Eliminar cuenta</p>
            <p className="text-sm text-stone-500">
              Borra la cuenta para siempre (a diferencia de dar de baja). Solo se puede si{" "}
              {usuario.nombre} nunca cargó visitas ni pedidos.
            </p>
          </div>
          <BotonEliminar
            accion={eliminarUsuario}
            id={usuario.id}
            confirmacion={`Esto borra la cuenta de ${usuario.nombre} para siempre, no se puede deshacer. ¿Continuar?`}
          />
        </div>
      )}
    </>
  );
}
