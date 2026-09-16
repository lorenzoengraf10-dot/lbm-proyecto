import Link from "next/link";
import { Tabla } from "@/components/tabla";
import { Etiqueta, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { armarNumeros, type FilaRanking } from "@/lib/numeros";
import { etiquetaSemana, semanaActual, ultimasSemanas } from "@/lib/semana";
import {
  diaArgentina,
  formatearComision,
  formatearPrecio,
  mesActual,
  sumarDias,
  ultimosMeses,
} from "@lbm/shared";

/** Una barra proporcional al máximo de la lista: se ve de un vistazo quién
 * lidera el ranking sin tener que comparar los números uno por uno. */
function BarraRanking({ fila, maximo }: { fila: FilaRanking; maximo: number }) {
  const porcentaje = maximo > 0 ? Math.round((fila.valor / maximo) * 100) : 0;
  return (
    <div className="space-y-1 px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium text-stone-900">{fila.nombre}</span>
        <span className="shrink-0 text-stone-500">
          {formatearPrecio(fila.valor)} · {fila.detalle}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-stone-900" style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  );
}

function TarjetaRanking({
  titulo,
  filas,
  vacio,
}: {
  titulo: string;
  filas: FilaRanking[];
  vacio: string;
}) {
  const maximo = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <div className={`${estilos.tarjeta} overflow-hidden`}>
      <p className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-900">
        {titulo}
      </p>
      {filas.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-stone-500">{vacio}</p>
      ) : (
        <div className="divide-y divide-stone-100">
          {filas.map((fila) => (
            <BarraRanking key={fila.id} fila={fila} maximo={maximo} />
          ))}
        </div>
      )}
    </div>
  );
}

function Dato({ titulo, valor, ayuda }: { titulo: string; valor: string; ayuda?: string }) {
  return (
    <div>
      <p className="text-sm text-stone-500">{titulo}</p>
      <p className="text-lg font-semibold text-stone-900">{valor}</p>
      {ayuda ? <p className="text-xs text-stone-400">{ayuda}</p> : null}
    </div>
  );
}

/**
 * Los números del negocio, en una sola pantalla y con un solo período.
 *
 * Antes eran tres secciones —Estadísticas, Comisiones y Reporte— que
 * contestaban casi lo mismo pero cada una con su propio selector de fecha: una
 * por mes, otra por desde/hasta y otra por semana. Había que aprender cuál
 * mira qué, y comparar entre ellas era imposible porque nunca cubrían el mismo
 * tramo. Ahora se elige el período una vez y todo lo de abajo habla de ese
 * mismo tramo.
 */
export default async function PaginaNumeros({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; semana?: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { desde, hasta } = await searchParams;

  const numeros = await armarNumeros(supabase, desde, hasta);

  const hoy = diaArgentina();
  const mes = mesActual();
  const mesPasado = ultimosMeses(2)[1];
  const hayPeriodo = Boolean(desde || hasta);

  const tramo = (d: string, h: string) => `/numeros?desde=${d}&hasta=${h}`;
  const semanas = ultimasSemanas(12);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Números</h1>
        <p className="text-sm text-stone-500">
          Cuánto se vendió, quién compra más, qué sale más y cuánto hay que pagarle al repartidor.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Desde</span>
          <input
            type="date"
            name="desde"
            defaultValue={desde ?? ""}
            max={hoy}
            className={estilos.input}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Hasta</span>
          <input
            type="date"
            name="hasta"
            defaultValue={hasta ?? ""}
            max={hoy}
            className={estilos.input}
          />
        </label>
        <button type="submit" className={estilos.botonSecundario}>
          Ver
        </button>

        {/* Los atajos son lo que hace que no haya que pelearse con el
            calendario para las tres preguntas de siempre. */}
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={tramo(mes.desde, hoy)} className="text-stone-500 underline hover:text-stone-900">
            Este mes
          </Link>
          <Link
            href={tramo(mesPasado.desde, mesPasado.hasta)}
            className="text-stone-500 underline hover:text-stone-900"
          >
            Mes pasado
          </Link>
          <Link
            href={tramo(sumarDias(hoy, -6), hoy)}
            className="text-stone-500 underline hover:text-stone-900"
          >
            Últimos 7 días
          </Link>
          {hayPeriodo ? (
            <Link href="/numeros" className="text-stone-500 underline hover:text-stone-900">
              Todo el historial
            </Link>
          ) : null}
        </div>
      </form>

      {!hayPeriodo ? (
        <p className="text-xs text-stone-500">Sin período elegido: son los totales de siempre.</p>
      ) : null}

      <div className={`${estilos.tarjeta} grid gap-4 p-5 sm:grid-cols-4`}>
        <Dato titulo="Facturado" valor={formatearPrecio(numeros.totalFacturado)} />
        <Dato titulo="Pedidos" valor={String(numeros.cantidadPedidos)} />
        <Dato titulo="Ticket promedio" valor={formatearPrecio(numeros.ticketPromedio)} />
        {/* Los dos totales son distintos a propósito y conviene decirlo acá,
            que es donde se los ve uno al lado del otro. */}
        <Dato
          titulo="A pagar en comisiones"
          valor={formatearPrecio(numeros.totalComisiones)}
          ayuda="solo por lo entregado"
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-base font-medium text-stone-900">Por repartidor</h2>
        <p className="text-xs text-stone-500">
          Lo vendido es todo lo que cargó en el período; la comisión se paga solo por lo entregado.
          Cada pedido usa el porcentaje que tenía cuando se cargó, así cambiarle la comisión no
          mueve lo ya ganado.
        </p>
        <Tabla
          filas={numeros.vendedores}
          clave={(fila) => fila.id}
          vacio="Todavía no hay repartidores cargados."
          columnas={[
            {
              encabezado: "Repartidor",
              principal: true,
              celda: (fila) => (
                <>
                  {fila.nombre} {fila.activo ? null : <Etiqueta activo={false} />}
                </>
              ),
            },
            {
              encabezado: "Comisión",
              celda: (fila) =>
                // Si en el período hubo un cambio de porcentaje se muestran los
                // dos, en vez de un número que no explicaría el total.
                fila.porcentajes.map((pct) => formatearComision(pct)).join(" y "),
            },
            { encabezado: "Pedidos", celda: (fila) => fila.pedidos },
            {
              encabezado: "Vendido",
              celda: (fila) => formatearPrecio(fila.totalVendido),
            },
            {
              encabezado: "Entregado",
              soloEscritorio: true,
              celda: (fila) => formatearPrecio(fila.totalEntregado),
            },
            { encabezado: "A pagar", celda: (fila) => formatearPrecio(fila.comision) },
          ]}
          pie={[
            { etiqueta: "Vendido", valor: formatearPrecio(numeros.totalFacturado) },
            { etiqueta: "A pagar", valor: formatearPrecio(numeros.totalComisiones) },
          ]}
        />
      </div>

      <TarjetaRanking
        titulo="Comercios que más compraron"
        filas={numeros.comercios}
        vacio="Sin pedidos en el período elegido."
      />
      <TarjetaRanking
        titulo="Productos más vendidos"
        filas={numeros.productos}
        vacio="Sin pedidos en el período elegido."
      />

      {/* El PDF va aparte y con su propio selector porque es otra cosa: un
          documento de una semana de lunes a domingo, para imprimir o mandar.
          Colgarlo del período de arriba sería prometer un PDF de cualquier
          tramo, que no es lo que sale. */}
      <div className={`${estilos.tarjeta} space-y-2 p-5`}>
        <p className="text-sm font-medium text-stone-900">Reporte semanal en PDF</p>
        <p className="text-sm text-stone-500">
          De lunes a domingo, listo para imprimir o mandar. Es lo único que va por semana entera.
        </p>
        <form action="/reportes/semanal" className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1 text-sm">
            <span className={estilos.etiqueta}>Semana</span>
            <select name="semana" defaultValue={semanaActual().lunes} className={estilos.input}>
              {semanas.map((opcion, i) => (
                <option key={opcion.lunes} value={opcion.lunes}>
                  {etiquetaSemana(opcion)}
                  {i === 0 ? " (en curso)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={estilos.boton}>
            Descargar PDF
          </button>
        </form>
      </div>
    </>
  );
}
