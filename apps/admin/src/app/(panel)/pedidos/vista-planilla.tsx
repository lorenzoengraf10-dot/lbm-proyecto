import Link from "next/link";
import { Tabla } from "@/components/tabla";
import { estilos } from "@/components/ui";
import type { SesionAdmin } from "@/lib/auth";
import { MAXIMO_DIAS_PLANILLA, armarPlanilla, diaArgentina, etiquetaRango, formatearCantidad, formatearPrecio, leerParametrosPlanilla, sumarDias } from "@lbm/shared";
import { VISTA_ARMAR, type ParametrosPedidos } from "./parametros";

/**
 * Lo mismo que el listado pero sumado por comercio, que es lo que hace falta a
 * la mañana con la hoja impresa en la mano: quién pidió qué y cuántos kilos
 * hay que cortar en total.
 */
export async function VistaParaArmar({
  supabase,
  parametros,
}: {
  supabase: SesionAdmin["supabase"];
  parametros: ParametrosPedidos;
}) {
  const hoy = diaArgentina();
  // La misma lectura que usa la descarga, para que el Excel no pueda salir de
  // un tramo distinto del que se está mirando.
  const { rango, opciones } = leerParametrosPlanilla(parametros);
  const { soloQuePidieron, soloFaltaArmar } = opciones;

  const planilla = await armarPlanilla(supabase, rango, opciones);

  // Una sola función para todos los enlaces —los atajos, los dos filtros y el
  // botón del Excel—, que es donde se gana o se pierde que la descarga sea lo
  // mismo que la pantalla. Los vacíos se descartan para no dejar ?solo= suelto.
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
  const conFiltro = (cambios: Parameters<typeof consulta>[0]) =>
    `/pedidos?ver=${VISTA_ARMAR}&${consulta(cambios)}`;
  const unDia = (dia: string) => conFiltro({ desde: dia, hasta: dia });

  const cuantos = planilla.cuantosPidieron;
  const porUnidad = planilla.unidades.map(
    (unidad) => ` · ${formatearCantidad(planilla.totales[unidad.clave] ?? 0)} ${unidad.corta}`
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-stone-500">
          Cada comercio con lo que pidió y el total de kilos y unidades para tener todo a mano al
          armar los pedidos. El Excel sale listo para imprimir en una hoja, con una casilla al
          costado de cada uno para ir tachando lo que ya está hecho.
        </p>
        <a href={`/planilla/excel?${consulta({})}`} className={`${estilos.boton} shrink-0`}>
          Descargar Excel
        </a>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        {/* Sin esto, tocar "Ver" perdería la solapa y saltaría al listado. */}
        <input type="hidden" name="ver" value={VISTA_ARMAR} />
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Desde</span>
          <input
            type="date"
            name="desde"
            defaultValue={rango.desde}
            max={hoy}
            className={estilos.input}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Hasta</span>
          <input
            type="date"
            name="hasta"
            defaultValue={rango.hasta}
            max={hoy}
            className={estilos.input}
          />
        </label>
        {/* Los dos filtros viajan escondidos en el formulario. Si faltara el de
            "falta", cambiar las fechas lo apagaría sin avisar y la hoja que se
            imprime traería también lo ya entregado. */}
        {soloQuePidieron ? <input type="hidden" name="solo" value="1" /> : null}
        {soloFaltaArmar ? <input type="hidden" name="falta" value="1" /> : null}
        <button type="submit" className={estilos.botonSecundario}>
          Ver
        </button>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={unDia(hoy)} className="text-stone-500 underline hover:text-stone-900">
            Hoy
          </Link>
          <Link
            href={unDia(sumarDias(hoy, -1))}
            className="text-stone-500 underline hover:text-stone-900"
          >
            Ayer
          </Link>
          {/* El atajo del tramo: es lo que hace que se descubra que se puede
              pedir más de un día sin tener que pelearse con el calendario. */}
          <Link
            href={conFiltro({ desde: sumarDias(hoy, -6), hasta: hoy })}
            className="text-stone-500 underline hover:text-stone-900"
          >
            Últimos 7 días
          </Link>
        </div>
      </form>

      {rango.recortado ? (
        <p className="text-sm text-amber-700">
          El tramo pedido era muy largo: se muestran los últimos {MAXIMO_DIAS_PLANILLA} días.
        </p>
      ) : null}

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-medium text-stone-900">
          {etiquetaRango(rango.desde, rango.hasta)}
        </h2>
        <p className="text-sm text-stone-500">
          {soloFaltaArmar
            ? `${cuantos} ${cuantos === 1 ? "comercio" : "comercios"} con algo por armar`
            : `${cuantos} ${cuantos === 1 ? "comercio pidió" : "comercios pidieron"}`}
          {porUnidad}
          {planilla.totalPesos > 0 ? ` · ${formatearPrecio(planilla.totalPesos)}` : ""}
        </p>
      </div>

      {/* A simple vista una planilla filtrada es idéntica a una entera, y la
          diferencia son kilos de fiambre: cuando el filtro está puesto tiene
          que verse, no alcanza con que el enlace diga "quitar". */}
      {soloFaltaArmar ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Estás viendo <strong>solo lo que falta armar</strong>: quedan afuera los pedidos ya
          preparados y los entregados.
        </p>
      ) : null}

      {rango.desde !== rango.hasta ? (
        <p className="text-sm text-stone-500">
          Las cantidades están sumadas a lo largo del tramo: un comercio que pidió dos días sale en
          un solo renglón con el total.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link
          href={conFiltro({ falta: soloFaltaArmar ? "" : "1" })}
          className="text-stone-500 underline hover:text-stone-900"
        >
          {soloFaltaArmar ? "Mostrar todos los pedidos" : "Mostrar solo lo que falta armar"}
        </Link>
        <Link
          href={conFiltro({ solo: soloQuePidieron ? "" : "1" })}
          className="text-stone-500 underline hover:text-stone-900"
        >
          {soloQuePidieron ? "Mostrar todos los comercios" : "Mostrar solo los que pidieron"}
        </Link>
      </div>

      <Tabla
        filas={planilla.filas}
        clave={(fila) => fila.id}
        vacio={
          soloFaltaArmar
            ? "No queda nada por armar."
            : soloQuePidieron
              ? "No pidió ningún comercio."
              : "Todavía no hay comercios cargados."
        }
        columnas={[
          {
            encabezado: "Comercio",
            principal: true,
            celda: (fila) => (
              <Link href={`/comercios/${fila.id}`} className="hover:underline">
                {fila.codigo} · {fila.nombre}
              </Link>
            ),
          },
          {
            encabezado: "Pedido",
            // En pantalla van todos en una celda y en el Excel uno por celda:
            // dice lo mismo, pero veinte columnas en un celular no se leen.
            celda: (fila) =>
              fila.lineas.length > 0 ? (
                <span className="text-stone-700">
                  {fila.lineas.map((linea) => linea.texto).join("  ·  ")}
                </span>
              ) : (
                <span className="text-stone-400">—</span>
              ),
          },
          {
            // Con el filtro puesto la columna ya no es lo que compró el
            // comercio sino lo que queda por armarle.
            encabezado: soloFaltaArmar ? "Pendiente" : "Total",
            celda: (fila) => (fila.pidio ? formatearPrecio(fila.totalPesos) : ""),
          },
        ]}
        pie={[
          {
            etiqueta: soloFaltaArmar ? "Pendiente" : "Total",
            valor: formatearPrecio(planilla.totalPesos),
          },
        ]}
      />

      {/* Lo que hay que preparar: el mismo resumen que va al pie del Excel, con
          el nombre completo de cada producto (que de paso aclara qué quiere
          decir cada abreviatura). */}
      {planilla.preparar.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-base font-medium text-stone-900">
            {soloFaltaArmar || rango.desde === rango.hasta ? "Para preparar" : "Total de lo pedido"}
          </h2>
          <div className={`${estilos.tarjeta} divide-y divide-stone-100`}>
            {planilla.preparar.map((linea) => (
              <div key={linea.productoId} className="flex justify-between gap-3 px-4 py-2 text-sm">
                <span className="text-stone-700">
                  {linea.nombre}
                  {linea.corto !== linea.nombre ? (
                    <span className="ml-2 text-xs text-stone-400">{linea.corto}</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-medium text-stone-900">
                  {formatearCantidad(linea.cantidad)} {linea.unidad}
                </span>
              </div>
            ))}
            <div className="flex justify-between gap-3 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-900">
              <span>Total</span>
              <span>
                {planilla.unidades
                  .map(
                    (unidad) =>
                      `${formatearCantidad(planilla.totales[unidad.clave] ?? 0)} ${unidad.corta}`
                  )
                  .join(" · ")}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
