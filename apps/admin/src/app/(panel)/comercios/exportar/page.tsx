import Link from "next/link";
import { Tabla } from "@/components/tabla";
import { estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { diaArgentina, diaValido, etiquetaDiaLargo, sumarDias } from "@/lib/fechas";
import { formatearCantidad, formatearPrecio } from "@/lib/formato";
import { armarPlanillaDia, type FilaPlanilla } from "@/lib/planilla-dia";

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
  const acortados = planilla.productos.filter((producto) => producto.corto !== producto.nombre);

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
        Todos los comercios con lo que pidió cada uno ese día, una columna por producto. Sirve para
        preparar a la mañana y para salir a repartir.
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
          // Los mismos nombres cortos que el Excel: lo que se ve acá es lo que
          // se imprime.
          ...planilla.productos.map((producto) => ({
            encabezado: `${producto.corto} (${producto.unidad})`,
            celda: (fila: FilaPlanilla) =>
              // Vacío y no "0": un cero se lee como "pidió cero".
              fila.cantidades[producto.id] !== undefined
                ? formatearCantidad(fila.cantidades[producto.id])
                : "",
          })),
          // Una columna de total por unidad: los kilos no se pueden sumar con
          // las unidades.
          ...planilla.unidades.map((unidad) => ({
            encabezado: `Total ${unidad.corta}`,
            celda: (fila: FilaPlanilla) =>
              fila.totales[unidad.clave] !== undefined
                ? formatearCantidad(fila.totales[unidad.clave])
                : "",
          })),
          {
            encabezado: "Total",
            celda: (fila) => (fila.pidio ? formatearPrecio(fila.totalPesos) : ""),
          },
        ]}
        pie={[
          ...planilla.productos.map((producto) => ({
            etiqueta: producto.corto,
            valor: formatearCantidad(planilla.porProducto[producto.id] ?? 0),
          })),
          ...planilla.unidades.map((unidad) => ({
            etiqueta: `Total ${unidad.corta}`,
            valor: formatearCantidad(planilla.totales[unidad.clave] ?? 0),
          })),
          { etiqueta: "Total", valor: formatearPrecio(planilla.totalPesos) },
        ]}
      />

      {/* Los nombres que se acortaron, aclarados abajo: en el Excel impreso va
          la misma línea. */}
      {acortados.length > 0 ? (
        <p className="text-sm text-stone-500">
          {acortados.map((producto) => `${producto.corto} = ${producto.nombre}`).join("  ·  ")}
        </p>
      ) : null}
    </>
  );
}
