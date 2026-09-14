import Link from "next/link";
import { Tabla } from "@/components/tabla";
import { estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { diaArgentina, diaValido, etiquetaDiaLargo, sumarDias } from "@/lib/fechas";
import { formatearCantidad, formatearPrecio } from "@/lib/formato";
import { armarPlanillaDia } from "@/lib/planilla-dia";

export default async function PaginaExportar({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; solo?: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { dia: diaPedido, solo } = await searchParams;

  const hoy = diaArgentina();
  const dia = diaValido(diaPedido) ?? hoy;
  const soloQuePidieron = solo === "1";

  const planilla = await armarPlanillaDia(supabase, dia, soloQuePidieron);

  const enlaceExcel = `/comercios/exportar/excel?dia=${dia}${soloQuePidieron ? "&solo=1" : ""}`;
  const conFiltro = (cambios: { dia?: string; solo?: string }) => {
    const partes = new URLSearchParams({ dia, ...(soloQuePidieron ? { solo: "1" } : {}), ...cambios });
    return `/comercios/exportar?${partes}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/comercios" className="text-sm text-stone-500 underline hover:text-stone-900">
          ← Comercios
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">Planilla del día</h1>
        <a href={enlaceExcel} className={`${estilos.boton} ml-auto`}>
          Descargar Excel
        </a>
      </div>

      <p className="text-sm text-stone-500">
        Todos los comercios con lo que pidió cada uno ese día, y abajo el total de lo que hay que
        preparar. En el Excel cada producto va en su propia celda, listo para imprimir en una hoja.
      </p>

      <form className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Día</span>
          <input type="date" name="dia" defaultValue={dia} max={hoy} className={estilos.input} />
        </label>
        {soloQuePidieron ? <input type="hidden" name="solo" value="1" /> : null}
        <button type="submit" className={estilos.botonSecundario}>
          Ver
        </button>
        <div className="flex gap-3 text-sm">
          <Link href={conFiltro({ dia: hoy })} className="text-stone-500 underline hover:text-stone-900">
            Hoy
          </Link>
          <Link
            href={conFiltro({ dia: sumarDias(hoy, -1) })}
            className="text-stone-500 underline hover:text-stone-900"
          >
            Ayer
          </Link>
        </div>
      </form>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-medium text-stone-900">{etiquetaDiaLargo(dia)}</h2>
        <p className="text-sm text-stone-500">
          {planilla.cuantosPidieron}{" "}
          {planilla.cuantosPidieron === 1 ? "comercio pidió" : "comercios pidieron"}
          {planilla.unidades.map(
            (unidad) => ` · ${formatearCantidad(planilla.totales[unidad.clave] ?? 0)} ${unidad.corta}`
          )}
          {planilla.totalPesos > 0 ? ` · ${formatearPrecio(planilla.totalPesos)}` : ""}
        </p>
        <Link
          href={conFiltro({ solo: soloQuePidieron ? "" : "1" })}
          className="text-sm text-stone-500 underline hover:text-stone-900"
        >
          {soloQuePidieron ? "Mostrar todos los comercios" : "Mostrar solo los que pidieron"}
        </Link>
      </div>

      <Tabla
        filas={planilla.filas}
        clave={(fila) => fila.id}
        vacio={
          soloQuePidieron
            ? "Ese día no pidió ningún comercio."
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
            encabezado: "Total",
            celda: (fila) => (fila.pidio ? formatearPrecio(fila.totalPesos) : ""),
          },
        ]}
        pie={[{ etiqueta: "Total", valor: formatearPrecio(planilla.totalPesos) }]}
      />

      {/* Lo que hay que preparar: el mismo resumen que va al pie del Excel, con
          el nombre completo de cada producto (que de paso aclara qué quiere
          decir cada abreviatura). */}
      {planilla.preparar.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-base font-medium text-stone-900">Para preparar</h2>
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
