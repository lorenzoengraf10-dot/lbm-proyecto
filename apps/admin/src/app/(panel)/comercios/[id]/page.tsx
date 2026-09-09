import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonEnviar } from "@/components/boton-enviar";
import { Etiqueta, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { cartelQr } from "@/lib/qr";
import { actualizarComercio, cambiarEstadoComercio } from "../actions";
import { FormularioComercio } from "../formulario";

export default async function PaginaEditarComercio({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { id } = await params;

  const { data: comercio } = await supabase
    .from("comercios")
    .select("id, codigo, nombre, localidad, telefono, activo")
    .eq("id", id)
    .maybeSingle();

  if (!comercio) {
    notFound();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/comercios" className="text-sm text-stone-500 underline hover:text-stone-900">
          ← Comercios
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">{comercio.codigo}</h1>
        <Etiqueta activo={comercio.activo} />
      </div>

      <div className={`${estilos.tarjeta} p-5`}>
        <FormularioComercio
          accion={actualizarComercio}
          valores={comercio}
          textoBoton="Guardar cambios"
        />
      </div>

      <div className={`${estilos.tarjeta} flex flex-wrap items-center gap-5 p-5`}>
        <div
          className="w-32 shrink-0"
          // El SVG lo arma cartelQr, que escapa todo el texto que viene de la base.
          dangerouslySetInnerHTML={{ __html: cartelQr(comercio) }}
        />
        <div className="min-w-48 flex-1">
          <p className="text-sm font-medium text-stone-900">QR del local</p>
          <p className="mb-3 text-sm text-stone-500">
            Se imprime, se recorta y se pega en el comercio. El vendedor lo escanea al llegar y eso
            registra la visita.
          </p>
          <a href={`/comercios/${comercio.id}/qr`} className={estilos.botonSecundario} download>
            Descargar para imprimir
          </a>
        </div>
      </div>

      <div className={`${estilos.tarjeta} flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div>
          <p className="text-sm font-medium text-stone-900">
            {comercio.activo ? "Dar de baja" : "Reactivar"}
          </p>
          <p className="text-sm text-stone-500">
            {comercio.activo
              ? "Deja de aparecer en la app del vendedor. No se borra nada: el histórico de visitas y pedidos se mantiene."
              : "Vuelve a aparecer en el listado de la app del vendedor."}
          </p>
        </div>
        <form action={cambiarEstadoComercio}>
          <input type="hidden" name="id" value={comercio.id} />
          <input type="hidden" name="activo" value={comercio.activo ? "false" : "true"} />
          <BotonEnviar
            variante="secundario"
            confirmacion={
              comercio.activo ? `¿Dar de baja ${comercio.codigo}?` : undefined
            }
          >
            {comercio.activo ? "Dar de baja" : "Reactivar"}
          </BotonEnviar>
        </form>
      </div>
    </>
  );
}
