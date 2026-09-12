import Link from "next/link";
import { PastillaEstado, PastillaImpago } from "@/components/estado-pedido";
import { Tabla } from "@/components/tabla";
import { estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { diaArgentina, diasDesde, rangoDelDia } from "@/lib/fechas";
import { formatearFechaHora, formatearPrecio } from "@/lib/formato";
import { armarReporteSemanal } from "@/lib/reporte-semanal";
import { etiquetaSemana, semanaActual } from "@/lib/semana";

const DIAS_DE_ALERTA = 15;

function Numero({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string | number;
  detalle?: string;
}) {
  return (
    <div>
      <p className="text-sm text-stone-500">{titulo}</p>
      <p className="text-lg font-semibold text-stone-900">{valor}</p>
      {detalle ? <p className="text-xs text-stone-500">{detalle}</p> : null}
    </div>
  );
}

export default async function PaginaInicio() {
  const { supabase, nombre } = await requerirAdmin();

  const hoy = diaArgentina();
  const { desdeIso, hastaIso } = rangoDelDia(hoy);
  const semana = semanaActual();

  // Todo en una sola tanda. Antes los nombres de los últimos pedidos se
  // buscaban después, en una segunda vuelta: con la base a 120 ms eso sumaba
  // un viaje entero de ida y vuelta a la pantalla más usada del panel. La
  // cartera y los vendedores son pocas filas, así que sale más barato traerlos
  // enteros de una que encadenar una consulta por ids.
  const [
    { data: pedidosHoy },
    { data: visitasHoy },
    { data: ultimos },
    { data: enCurso },
    { data: impagos },
    { data: comercios },
    { data: nombresComercios },
    { data: nombresVendedores },
    reporte,
  ] = await Promise.all([
    supabase.from("pedidos").select("total, estado").gte("fecha", desdeIso).lt("fecha", hastaIso),
    supabase.from("visitas").select("id").gte("fecha_hora", desdeIso).lt("fecha_hora", hastaIso),
    supabase
      .from("pedidos")
      .select("id, comercio_id, vendedor_id, fecha, total, estado, forma_pago, cobrado_en")
      .order("fecha", { ascending: false })
      .limit(5),
    // Lo que está en la cola de trabajo: sin entregar, de cualquier día.
    supabase.from("pedidos").select("id, estado").neq("estado", "completado"),
    // Lo entregado a cuenta que todavía no se cobró.
    supabase
      .from("pedidos")
      .select("total")
      .eq("forma_pago", "cuenta_corriente")
      .is("cobrado_en", null),
    supabase.from("cobertura_comercios").select("id, ultima_visita"),
    supabase.from("comercios").select("id, codigo, nombre"),
    supabase.from("usuarios").select("id, nombre"),
    armarReporteSemanal(supabase, semana),
  ]);

  // Facturado = lo entregado. Un pedido que todavía está en el mostrador no
  // es facturación todavía; los que faltan se muestran aparte, como tarea.
  const entregadosHoy = (pedidosHoy ?? []).filter((pedido) => pedido.estado === "completado");
  const facturadoHoy = entregadosHoy.reduce((total, pedido) => total + Number(pedido.total), 0);

  const porPreparar = (enCurso ?? []).filter((pedido) => pedido.estado === "pedido").length;
  const porEntregar = (enCurso ?? []).filter((pedido) => pedido.estado === "preparado").length;
  const totalImpago = (impagos ?? []).reduce((total, pedido) => total + Number(pedido.total), 0);

  const desatendidos = (comercios ?? []).filter(
    (comercio) => !comercio.ultima_visita || diasDesde(comercio.ultima_visita) >= DIAS_DE_ALERTA
  ).length;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Hola, {nombre}</h1>
        <p className="text-sm text-stone-500">Cómo viene el día y la semana.</p>
      </div>

      {porPreparar > 0 || porEntregar > 0 ? (
        <div className={`${estilos.tarjeta} space-y-3 p-5`}>
          <p className="text-sm font-semibold text-stone-900">Para hacer</p>
          <div className="flex flex-wrap gap-2">
            {porPreparar > 0 ? (
              <Link
                href="/pedidos?estado=pedido"
                className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                <span className="font-semibold text-stone-900">{porPreparar}</span>{" "}
                {porPreparar === 1 ? "pedido por preparar" : "pedidos por preparar"} →
              </Link>
            ) : null}
            {porEntregar > 0 ? (
              <Link
                href="/pedidos?estado=preparado"
                className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                <span className="font-semibold text-stone-900">{porEntregar}</span>{" "}
                {porEntregar === 1 ? "listo para salir" : "listos para salir"} →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {totalImpago > 0 ? (
        <Link
          href="/pedidos?impagos=1"
          className="block rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span className="font-medium">{formatearPrecio(totalImpago)} sin cobrar</span> en pedidos
          entregados a cuenta. Ver cuáles →
        </Link>
      ) : null}

      <div className={`${estilos.tarjeta} space-y-4 p-5`}>
        <p className="text-sm font-semibold text-stone-900">Hoy</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Numero titulo="Pedidos" valor={(pedidosHoy ?? []).length} />
          <Numero
            titulo="Facturado"
            valor={formatearPrecio(facturadoHoy)}
            detalle={
              entregadosHoy.length < (pedidosHoy ?? []).length
                ? `${entregadosHoy.length} de ${(pedidosHoy ?? []).length} entregados`
                : undefined
            }
          />
          <Numero titulo="Visitas" valor={(visitasHoy ?? []).length} />
        </div>
      </div>

      <div className={`${estilos.tarjeta} space-y-4 p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-stone-900">
            Semana en curso{" "}
            <span className="font-normal text-stone-500">({etiquetaSemana(semana)})</span>
          </p>
          <Link href="/reportes" className="text-sm text-stone-600 underline hover:text-stone-900">
            Ver el reporte
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Numero titulo="Facturado" valor={formatearPrecio(reporte.totalFacturado)} />
          <Numero titulo="Pedidos" valor={reporte.cantidadPedidos} />
          <Numero
            titulo="Comisiones"
            valor={formatearPrecio(reporte.totalComisiones)}
            detalle="a pagar por esta semana"
          />
        </div>
      </div>

      {desatendidos > 0 ? (
        <Link
          href={`/cobertura?dias=${DIAS_DE_ALERTA}`}
          className="block rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span className="font-medium">
            {desatendidos} {desatendidos === 1 ? "comercio lleva" : "comercios llevan"}{" "}
            {DIAS_DE_ALERTA} días o más sin visita.
          </span>{" "}
          Ver cuáles →
        </Link>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-stone-900">Últimos pedidos</h2>
        <Link href="/pedidos" className="text-sm text-stone-600 underline hover:text-stone-900">
          Ver todos
        </Link>
      </div>

      <Tabla
        filas={ultimos ?? []}
        clave={(pedido) => pedido.id}
        vacio="Todavía no se cargó ningún pedido."
        columnas={[
          {
            encabezado: "Comercio",
            principal: true,
            celda: (pedido) => {
              const comercio = (nombresComercios ?? []).find((c) => c.id === pedido.comercio_id);
              return (
                <Link href={`/pedidos/${pedido.id}`} className="hover:underline">
                  {comercio ? `${comercio.codigo} · ${comercio.nombre}` : "—"}
                </Link>
              );
            },
          },
          {
            encabezado: "Estado",
            celda: (pedido) => (
              <span className="flex flex-wrap items-center gap-1">
                <PastillaEstado estado={pedido.estado} />
                <PastillaImpago formaPago={pedido.forma_pago} cobradoEn={pedido.cobrado_en} />
              </span>
            ),
          },
          { encabezado: "Fecha", celda: (pedido) => formatearFechaHora(pedido.fecha) },
          {
            encabezado: "Vendedor",
            celda: (pedido) =>
              (nombresVendedores ?? []).find((v) => v.id === pedido.vendedor_id)?.nombre ?? "—",
          },
          { encabezado: "Total", celda: (pedido) => formatearPrecio(pedido.total) },
        ]}
      />
    </>
  );
}
