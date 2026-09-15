import Link from "next/link";
import {
  MAXIMO_DIAS_PLANILLA,
  diaArgentina,
  etiquetaRango,
  formatearCantidad,
  formatearPrecio,
  leerParametrosPlanilla,
  sumarDias,
  type ParametrosPlanilla,
} from "@lbm/shared";
import { EstadoVacio, estilos } from "@/components/ui";
import { planillaDelRepartidor } from "@/lib/planilla-repartidor";

// Esta pantalla sale del servidor, no del IndexedDB: sin señal no hay
// planilla. Es a propósito —son los pedidos de todos los comercios, no solo
// los que tomó este celular— y la pantalla lo dice abajo.
export const dynamic = "force-dynamic";

export default async function PaginaPlanilla({
  searchParams,
}: {
  searchParams: Promise<ParametrosPlanilla>;
}) {
  const parametros = await searchParams;
  const hoy = diaArgentina();
  // La misma lectura que usa la descarga y que el panel del dueño, así los
  // tres miran siempre el mismo tramo.
  const { rango, opciones } = leerParametrosPlanilla(parametros);
  const { soloQuePidieron, soloFaltaArmar } = opciones;

  const planilla = await planillaDelRepartidor(rango, opciones);

  const consulta = (cambios: Partial<Record<"desde" | "hasta" | "solo" | "falta", string>>) => {
    const valores = {
      desde: rango.desde,
      hasta: rango.hasta,
      solo: soloQuePidieron ? "1" : "",
      falta: soloFaltaArmar ? "1" : "",
      ...cambios,
    };
    const partes = new URLSearchParams();
    for (const [clave, valor] of Object.entries(valores)) if (valor) partes.set(clave, valor);
    return partes.toString();
  };
  const conFiltro = (cambios: Parameters<typeof consulta>[0]) => `/planilla?${consulta(cambios)}`;
  const unDia = (dia: string) => conFiltro({ desde: dia, hasta: dia });

  const cuantos = planilla.cuantosPidieron;
  const porUnidad = planilla.unidades
    .map((unidad) => `${formatearCantidad(planilla.totales[unidad.clave] ?? 0)} ${unidad.corta}`)
    .join(" · ");

  return (
    <>
      <h1 className="text-lg font-semibold text-stone-900">Planilla para armar</h1>

      <form className="space-y-3">
        <div className="flex gap-2">
          <label className="block flex-1 space-y-1">
            <span className={estilos.etiqueta}>Desde</span>
            <input
              type="date"
              name="desde"
              defaultValue={rango.desde}
              max={hoy}
              className={estilos.input}
            />
          </label>
          <label className="block flex-1 space-y-1">
            <span className={estilos.etiqueta}>Hasta</span>
            <input
              type="date"
              name="hasta"
              defaultValue={rango.hasta}
              max={hoy}
              className={estilos.input}
            />
          </label>
        </div>
        {/* Los dos filtros viajan escondidos: sin esto, cambiar las fechas los
            apagaría sin avisar. */}
        {soloQuePidieron ? <input type="hidden" name="solo" value="1" /> : null}
        {soloFaltaArmar ? <input type="hidden" name="falta" value="1" /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={estilos.botonSecundario}>
            Ver
          </button>
          <Link href={unDia(hoy)} className="text-sm text-stone-500 underline">
            Hoy
          </Link>
          <Link href={unDia(sumarDias(hoy, -1))} className="text-sm text-stone-500 underline">
            Ayer
          </Link>
          <Link
            href={conFiltro({ desde: sumarDias(hoy, -6), hasta: hoy })}
            className="text-sm text-stone-500 underline"
          >
            Últimos 7 días
          </Link>
        </div>
      </form>

      <a href={`/planilla/excel?${consulta({})}`} className={`block text-center ${estilos.boton}`}>
        Descargar Excel
      </a>

      {rango.recortado ? (
        <p className="text-sm text-amber-700">
          El tramo pedido era muy largo: se muestran los últimos {MAXIMO_DIAS_PLANILLA} días.
        </p>
      ) : null}

      <div>
        <h2 className="text-base font-medium text-stone-900">
          {etiquetaRango(rango.desde, rango.hasta)}
        </h2>
        <p className="text-sm text-stone-500">
          {soloFaltaArmar
            ? `${cuantos} ${cuantos === 1 ? "comercio" : "comercios"} con algo por armar`
            : `${cuantos} ${cuantos === 1 ? "comercio pidió" : "comercios pidieron"}`}
          {porUnidad ? ` · ${porUnidad}` : ""}
          {planilla.totalPesos > 0 ? ` · ${formatearPrecio(planilla.totalPesos)}` : ""}
        </p>
      </div>

      {soloFaltaArmar ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Estás viendo <strong>solo lo que falta armar</strong>: quedan afuera los pedidos ya
          preparados y los entregados.
        </p>
      ) : null}

      {rango.desde !== rango.hasta ? (
        <p className="text-sm text-stone-500">
          Las cantidades están sumadas a lo largo del tramo: un comercio que pidió dos días sale una
          sola vez, con el total.
        </p>
      ) : null}

      <div className="flex flex-col gap-1 text-sm">
        <Link href={conFiltro({ falta: soloFaltaArmar ? "" : "1" })} className="text-stone-500 underline">
          {soloFaltaArmar ? "Mostrar todos los pedidos" : "Mostrar solo lo que falta armar"}
        </Link>
        <Link href={conFiltro({ solo: soloQuePidieron ? "" : "1" })} className="text-stone-500 underline">
          {soloQuePidieron ? "Mostrar todos los comercios" : "Mostrar solo los que pidieron"}
        </Link>
      </div>

      {/* En el celular no entra una tabla de veinte columnas: cada comercio es
          una tarjeta con su pedido escrito seguido, igual que en el Excel pero
          en un renglón que se pliega. */}
      {planilla.filas.length === 0 ? (
        <div className={`${estilos.tarjeta} overflow-hidden`}>
          <EstadoVacio>
            {soloFaltaArmar ? "No queda nada por armar." : "No pidió ningún comercio."}
          </EstadoVacio>
        </div>
      ) : (
        <div className={`${estilos.tarjeta} divide-y divide-stone-100`}>
          {planilla.filas.map((fila) => (
            <div key={fila.id} className="space-y-1 px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-sm font-medium text-stone-900">
                  {fila.codigo} · {fila.nombre}
                </span>
                {fila.pidio ? (
                  <span className="shrink-0 text-sm text-stone-500">
                    {formatearPrecio(fila.totalPesos)}
                  </span>
                ) : null}
              </div>
              {fila.lineas.length > 0 ? (
                <p className="text-sm text-stone-700">
                  {fila.lineas.map((linea) => linea.texto).join("  ·  ")}
                </p>
              ) : (
                <p className="text-sm text-stone-400">—</p>
              )}
            </div>
          ))}
        </div>
      )}

      {planilla.preparar.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-base font-medium text-stone-900">
            {soloFaltaArmar || rango.desde === rango.hasta ? "Para preparar" : "Total de lo pedido"}
          </h2>
          <div className={`${estilos.tarjeta} divide-y divide-stone-100`}>
            {planilla.preparar.map((linea) => (
              <div key={linea.productoId} className="flex justify-between gap-3 px-4 py-2 text-sm">
                <span className="text-stone-700">{linea.nombre}</span>
                <span className="shrink-0 font-medium text-stone-900">
                  {formatearCantidad(linea.cantidad)} {linea.unidad}
                </span>
              </div>
            ))}
            <div className="flex justify-between gap-3 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-900">
              <span>Total</span>
              <span>{porUnidad}</span>
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-stone-400">
        Esta pantalla necesita señal: son los pedidos de todos los comercios, no solo los que
        cargaste vos, así que salen del servidor y no del celular. El Excel se baja bien desde acá,
        pero para imprimirlo conviene una computadora.
      </p>
    </>
  );
}
