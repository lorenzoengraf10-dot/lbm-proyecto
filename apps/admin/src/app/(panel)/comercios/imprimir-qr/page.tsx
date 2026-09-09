import Link from "next/link";
import { EstadoVacio, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { cartelQr } from "@/lib/qr";
import { BotonImprimir } from "./boton-imprimir";

export default async function PaginaImprimirQr() {
  const { supabase } = await requerirAdmin();

  const { data: comercios, error } = await supabase
    .from("comercios")
    .select("id, codigo, nombre, localidad")
    .eq("activo", true)
    .order("codigo");

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/comercios" className="text-sm text-stone-500 underline hover:text-stone-900">
          ← Comercios
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">QR para imprimir</h1>
        <div className="ml-auto">
          <BotonImprimir />
        </div>
      </div>

      <p className="text-sm text-stone-500 print:hidden">
        Un cartel por cada comercio activo ({comercios?.length ?? 0}). Salen en tamaño real de 7×9
        cm, para recortar por la línea de puntos y pegar en el local. Los comercios dados de baja no
        aparecen.
      </p>

      {error ? (
        <EstadoVacio>No se pudieron cargar los comercios: {error.message}</EstadoVacio>
      ) : (comercios ?? []).length === 0 ? (
        <EstadoVacio>No hay comercios activos para imprimir.</EstadoVacio>
      ) : (
        <div className="grid grid-cols-2 gap-4 print:gap-0">
          {(comercios ?? []).map((comercio) => (
            <div
              key={comercio.id}
              className={`${estilos.tarjeta} flex justify-center p-2 print:break-inside-avoid print:border-0 print:shadow-none`}
              // El SVG lo arma cartelQr, que escapa todo el texto que viene de la base.
              dangerouslySetInnerHTML={{ __html: cartelQr(comercio) }}
            />
          ))}
        </div>
      )}
    </>
  );
}
