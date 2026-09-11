import { ordenarPorCodigo } from "@lbm/shared";
import Link from "next/link";
import { EstadoVacio, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { cartelQr } from "@/lib/qr";
import { BotonImprimir } from "./boton-imprimir";

export default async function PaginaImprimirQr({
  searchParams,
}: {
  searchParams: Promise<{ incluir?: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { incluir } = await searchParams;
  const incluirTodos = incluir === "todos";

  let consulta = supabase
    .from("comercios")
    .select("id, codigo, nombre, localidad, activo")
    .order("codigo");
  if (!incluirTodos) consulta = consulta.eq("activo", true);

  const { data: datos, error } = await consulta;
  const comercios = ordenarPorCodigo(datos ?? []);
  const cantidad = comercios.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/comercios" className="text-sm text-stone-500 underline hover:text-stone-900">
          ← Comercios
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">QR para imprimir</h1>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={`/comercios/imprimir-qr/pdf${incluirTodos ? "?incluir=todos" : ""}`}
            className={estilos.boton}
          >
            Descargar PDF
          </a>
          <BotonImprimir />
        </div>
      </div>

      <div className="space-y-1 print:hidden">
        <p className="text-sm text-stone-500">
          Un cartel por comercio ({cantidad}), con el QR, el código bien grande y el nombre abajo.
          Salen en tamaño real de 7×9 cm, seis por hoja, para recortar por la línea de puntos y
          pegar en el local.
        </p>
        <p className="text-sm text-stone-500">
          El PDF es lo más cómodo para llevar a una imprenta; el botón de imprimir manda esta misma
          hoja a la impresora de acá.{" "}
          {incluirTodos ? (
            <Link href="/comercios/imprimir-qr" className="underline hover:text-stone-900">
              Mostrar solo los activos
            </Link>
          ) : (
            <Link href="/comercios/imprimir-qr?incluir=todos" className="underline hover:text-stone-900">
              Incluir también los dados de baja
            </Link>
          )}
        </p>
      </div>

      {error ? (
        <EstadoVacio>No se pudieron cargar los comercios: {error.message}</EstadoVacio>
      ) : cantidad === 0 ? (
        <EstadoVacio>No hay comercios activos para imprimir.</EstadoVacio>
      ) : (
        <div className="grid grid-cols-2 gap-4 print:gap-0">
          {comercios.map((comercio) => (
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
