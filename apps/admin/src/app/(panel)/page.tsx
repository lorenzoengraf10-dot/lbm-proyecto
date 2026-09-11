import Link from "next/link";
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

  const [{ data: pedidosHoy }, { data: visitasHoy }, { data: ultimos }, { data: comercios }, reporte] =
    await Promise.all([
      supabase.from("pedidos").select("total").gte("fecha", desdeIso).lt("fecha", hastaIso),
      supabase.from("visitas").select("id").gte("fecha_hora", desdeIso).lt("fecha_hora", hastaIso),
      supabase
        .from("pedidos")
        .select("id, comercio_id, vendedor_id, fecha, total")
        .order("fecha", { ascending: false })
        .limit(5),
      supabase.from("cobertura_comercios").select("id, ultima_visita"),
      armarReporteSemanal(supabase, semana),
    ]);

  const facturadoHoy = (pedidosHoy ?? []).reduce(
    (total, pedido) => total + Number(pedido.total),
    0
  );

  const desatendidos = (comercios ?? []).filter(
    (comercio) => !comercio.ultima_visita || diasDesde(comercio.ultima_visita) >= DIAS_DE_ALERTA
  ).length;

  // Los últimos pedidos traen ids: hay que resolverlos a nombres para que la
  // tabla se lea. Son cinco filas, así que alcanza con buscar solo esos.
  const idsComercios = [...new Set((ultimos ?? []).map((pedido) => pedido.comercio_id))];
  const idsVendedores = [...new Set((ultimos ?? []).map((pedido) => pedido.vendedor_id))];

  const [{ data: nombresComercios }, { data: nombresVendedores }] = await Promise.all([
    idsComercios.length
      ? supabase.from("comercios").select("id, codigo, nombre").in("id", idsComercios)
      : { data: [] },
    idsVendedores.length
      ? supabase.from("usuarios").select("id, nombre").in("id", idsVendedores)
      : { data: [] },
  ]);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Hola, {nombre}</h1>
        <p className="text-sm text-stone-500">Cómo viene el día y la semana.</p>
      </div>

      <div className={`${estilos.tarjeta} space-y-4 p-5`}>
        <p className="text-sm font-semibold text-stone-900">Hoy</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Numero titulo="Pedidos" valor={(pedidosHoy ?? []).length} />
          <Numero titulo="Facturado" valor={formatearPrecio(facturadoHoy)} />
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
