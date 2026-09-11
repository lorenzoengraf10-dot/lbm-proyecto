import Link from "next/link";
import { EstadoVacio, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { diasDesde } from "@/lib/fechas";
import { formatearFechaHora } from "@/lib/formato";

const CORTES = [
  { valor: "", etiqueta: "Todos" },
  { valor: "7", etiqueta: "Sin visitar hace 7 días o más" },
  { valor: "15", etiqueta: "Sin visitar hace 15 días o más" },
  { valor: "30", etiqueta: "Sin visitar hace 30 días o más" },
];

export default async function PaginaCobertura({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { dias } = await searchParams;
  const corte = Number(dias);

  const { data: comercios, error } = await supabase
    .from("cobertura_comercios")
    .select("id, codigo, nombre, localidad, ultima_visita, visitas_totales")
    .order("codigo");

  const filas = (comercios ?? [])
    .map((comercio) => ({
      ...comercio,
      // Sin visitas todavía: va con el número más alto para que quede
      // primero cuando se ordena por "hace cuánto", que es justo el caso
      // que más urge mirar.
      diasSinVisitar: comercio.ultima_visita ? diasDesde(comercio.ultima_visita) : Infinity,
    }))
    .filter((comercio) => (Number.isFinite(corte) && corte > 0 ? comercio.diasSinVisitar >= corte : true))
    .sort((a, b) => b.diasSinVisitar - a.diasSinVisitar);

  const nuncaVisitados = filas.filter((comercio) => comercio.diasSinVisitar === Infinity).length;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Cobertura</h1>
        <p className="text-sm text-stone-500">
          Comercios activos ordenados por hace cuánto que nadie los visita. Como no hay ruta fija,
          esta es la forma de que ninguno quede en el olvido.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Mostrar</span>
          <select name="dias" defaultValue={dias ?? ""} className={estilos.input}>
            {CORTES.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={estilos.botonSecundario}>
          Filtrar
        </button>
      </form>

      <div className={`${estilos.tarjeta} overflow-hidden`}>
        {error ? (
          <EstadoVacio>No se pudo cargar la cobertura: {error.message}</EstadoVacio>
        ) : filas.length === 0 ? (
          <EstadoVacio>
            {corte > 0
              ? `Ningún comercio lleva ${corte} días o más sin visitar. Buen trabajo.`
              : "Todavía no hay comercios activos."}
          </EstadoVacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  <th className={estilos.encabezadoCelda}>Comercio</th>
                  <th className={estilos.encabezadoCelda}>Localidad</th>
                  <th className={estilos.encabezadoCelda}>Última visita</th>
                  <th className={estilos.encabezadoCelda}>Hace</th>
                  <th className={estilos.encabezadoCelda}>Visitas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filas.map((comercio) => (
                  <tr key={comercio.id}>
                    <td className={`${estilos.celda} font-medium text-stone-900`}>
                      <Link href={`/comercios/${comercio.id}`} className="hover:underline">
                        {comercio.codigo} · {comercio.nombre}
                      </Link>
                    </td>
                    <td className={estilos.celda}>{comercio.localidad}</td>
                    <td className={estilos.celda}>
                      {comercio.ultima_visita ? formatearFechaHora(comercio.ultima_visita) : "—"}
                    </td>
                    <td className={estilos.celda}>
                      {comercio.diasSinVisitar === Infinity ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Nunca visitado
                        </span>
                      ) : comercio.diasSinVisitar === 0 ? (
                        "Hoy"
                      ) : (
                        `${comercio.diasSinVisitar} día${comercio.diasSinVisitar === 1 ? "" : "s"}`
                      )}
                    </td>
                    <td className={estilos.celda}>{comercio.visitas_totales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-sm text-stone-500">
        {filas.length} comercios listados
        {nuncaVisitados > 0 ? ` · ${nuncaVisitados} sin ninguna visita todavía` : ""}
      </p>
    </>
  );
}
