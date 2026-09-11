import Link from "next/link";
import { estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { type Estadisticas, type FilaRanking, armarEstadisticas } from "@/lib/estadisticas";
import { mesDesdeValor, ultimosMeses } from "@/lib/fechas";
import { formatearPrecio } from "@/lib/formato";

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

export default async function PaginaEstadisticas({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { mes: mesPedido } = await searchParams;

  // Un mes inválido en la URL se ignora: se muestra todo el historial.
  const rango = mesPedido ? mesDesdeValor(mesPedido) : null;
  const mes = rango?.valor;
  const estadisticas: Estadisticas = await armarEstadisticas(supabase, rango?.desde, rango?.hasta);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Estadísticas</h1>
        <p className="text-sm text-stone-500">
          Quién compra más, qué se vende más y quién vende más.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Período</span>
          <select name="mes" defaultValue={mes ?? ""} className={estilos.input}>
            <option value="">Todo el historial</option>
            {ultimosMeses(12).map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={estilos.botonSecundario}>
          Ver
        </button>
        {mes ? (
          <Link href="/estadisticas" className="text-sm text-stone-500 underline hover:text-stone-900">
            Ver todo el historial
          </Link>
        ) : null}
      </form>

      <div className={`${estilos.tarjeta} grid gap-4 p-5 sm:grid-cols-3`}>
        <div>
          <p className="text-sm text-stone-500">Total facturado</p>
          <p className="text-lg font-semibold text-stone-900">
            {formatearPrecio(estadisticas.totalFacturado)}
          </p>
        </div>
        <div>
          <p className="text-sm text-stone-500">Pedidos</p>
          <p className="text-lg font-semibold text-stone-900">{estadisticas.cantidadPedidos}</p>
        </div>
        <div>
          <p className="text-sm text-stone-500">Ticket promedio</p>
          <p className="text-lg font-semibold text-stone-900">
            {formatearPrecio(estadisticas.ticketPromedio)}
          </p>
        </div>
      </div>

      <TarjetaRanking
        titulo="Comercios que más compraron"
        filas={estadisticas.comercios}
        vacio="Sin pedidos en el período elegido."
      />
      <TarjetaRanking
        titulo="Productos más vendidos"
        filas={estadisticas.productos}
        vacio="Sin pedidos en el período elegido."
      />
      <TarjetaRanking
        titulo="Vendedores"
        filas={estadisticas.vendedores}
        vacio="Sin pedidos en el período elegido."
      />
    </>
  );
}
