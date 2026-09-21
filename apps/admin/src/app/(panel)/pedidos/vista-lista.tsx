import Link from "next/link";
import { ESTADOS, ETIQUETA_ESTADO, comienzoDelDiaIso, esEstado, finDelDiaIso, formatearFechaHora, formatearPrecio, mesDesdeValor, ultimosMeses } from "@lbm/shared";
import { PastillaEstado, PastillaImpago, TextoCobro } from "@/components/estado-pedido";
import { Tabla } from "@/components/tabla";
import { EstadoVacio, estilos } from "@/components/ui";
import type { SesionAdmin } from "@/lib/auth";
import type { ParametrosPedidos } from "./parametros";

/**
 * El registro pedido por pedido: para revisar uno, corregirlo, ver cómo se
 * cobró. La otra mitad de esta pantalla —"Para armar"— es lo mismo sumado por
 * comercio, que es lo que hace falta a la mañana con la hoja en la mano.
 */
export async function VistaLista({
  supabase,
  parametros,
}: {
  supabase: SesionAdmin["supabase"];
  parametros: ParametrosPedidos;
}) {
  const { vendedor, mes: mesPedido, estado: estadoPedido, impagos } = parametros;
  let { desde, hasta } = parametros;

  // El registro mensual: elegir un mes pisa cualquier Desde/Hasta escrito a
  // mano, para no tener dos filtros de fecha compitiendo a la vez. Un mes que
  // no existe (un enlace viejo, un pegado a medias) se ignora en vez de
  // tumbar la pantalla.
  const rango = mesPedido ? mesDesdeValor(mesPedido) : null;
  const mes = rango?.valor;
  if (rango) {
    desde = rango.desde;
    hasta = rango.hasta;
  }

  const [{ data: vendedores }, { data: comercios }] = await Promise.all([
    supabase.from("usuarios").select("id, nombre").eq("rol", "vendedor").order("nombre"),
    supabase.from("comercios").select("id, codigo, nombre"),
  ]);

  // Un estado inventado en la URL se ignora, como el mes: mejor mostrar todo
  // que tumbar la pantalla.
  const estado = esEstado(estadoPedido) ? estadoPedido : undefined;
  const soloImpagos = impagos === "1";

  let consulta = supabase
    .from("pedidos")
    .select("id, comercio_id, vendedor_id, fecha, total, corregido_en, estado, forma_pago, cobrado_en, sin_qr_motivo")
    .order("fecha", { ascending: false });

  if (vendedor) consulta = consulta.eq("vendedor_id", vendedor);
  if (estado) consulta = consulta.eq("estado", estado);
  // Lo entregado que quedó a cuenta y todavía no se cobró.
  if (soloImpagos) consulta = consulta.eq("forma_pago", "cuenta_corriente").is("cobrado_en", null);
  // Los dos extremos en hora argentina. Contra el día pelado, Postgres los lee
  // en UTC y el tramo queda corrido tres horas: el "hasta" cortaba a las 21:00
  // y se comía los pedidos de la nochecita.
  if (desde) consulta = consulta.gte("fecha", comienzoDelDiaIso(desde));
  if (hasta) consulta = consulta.lt("fecha", finDelDiaIso(hasta));

  const { data: pedidos, error } = await consulta;

  // pedidos.total es numeric(10,2): PostgREST lo manda como string ("6400.00")
  // para no perder precisión. Sumarlo con + sin convertir concatenaría texto
  // en vez de sumar números.
  const totalPeriodo = (pedidos ?? []).reduce(
    (acumulado, pedido) => acumulado + Number(pedido.total),
    0
  );

  const hayFiltro = Boolean(vendedor || desde || hasta || mes || estado || soloImpagos);

  // Lo que falta cobrar del período que se está viendo.
  const aCobrar = (pedidos ?? [])
    .filter((p) => p.forma_pago === "cuenta_corriente" && !p.cobrado_en)
    .reduce((total, p) => total + Number(p.total), 0);

  return (
    <>
      <form className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Vendedor</span>
          <select name="vendedor" defaultValue={vendedor ?? ""} className={estilos.input}>
            <option value="">Todos</option>
            {(vendedores ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Estado</span>
          <select name="estado" defaultValue={estado ?? ""} className={estilos.input}>
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO[e]}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Mes</span>
          <select name="mes" defaultValue={mes ?? ""} className={estilos.input}>
            <option value="">Elegir un mes…</option>
            {ultimosMeses(12).map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Desde</span>
          <input type="date" name="desde" defaultValue={desde ?? ""} className={estilos.input} />
        </label>

        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta ?? ""} className={estilos.input} />
        </label>

        <button type="submit" className={estilos.botonSecundario}>
          Filtrar
        </button>
        {hayFiltro ? (
          <Link href="/pedidos" className="text-sm text-stone-500 underline hover:text-stone-900">
            Sacar filtros
          </Link>
        ) : null}
      </form>
      {aCobrar > 0 && !soloImpagos ? (
        <Link
          href="/pedidos?impagos=1"
          className="block rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span className="font-medium">
            Quedan {formatearPrecio(aCobrar)} sin cobrar
          </span>{" "}
          en pedidos entregados a cuenta. Ver cuáles →
        </Link>
      ) : null}

      {mes ? (
        <p className="text-xs text-stone-500">
          Mostrando el mes elegido: se ignoran Desde/Hasta si también están cargados.
        </p>
      ) : null}

      {error ? (
        <div className={`${estilos.tarjeta} overflow-hidden`}>
          <EstadoVacio>No se pudieron cargar los pedidos: {error.message}</EstadoVacio>
        </div>
      ) : (
        <Tabla
          filas={pedidos ?? []}
          clave={(pedido) => pedido.id}
          vacio="No hay pedidos que coincidan con el filtro."
          columnas={[
            {
              encabezado: "Comercio",
              principal: true,
              celda: (pedido) => {
                const comercio = (comercios ?? []).find((c) => c.id === pedido.comercio_id);
                return (
                  <Link href={`/pedidos/${pedido.id}`} className="hover:underline">
                    {comercio ? `${comercio.codigo} · ${comercio.nombre}` : "—"}
                    {pedido.corregido_en ? (
                      <span className="ml-1.5 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 align-middle">
                        corregido
                      </span>
                    ) : null}
                    {/* El pedido se carga escaneando el QR del comercio. Este
                        se cargó sin escanearlo, y eso es justamente lo que hay
                        que poder ver de un vistazo. */}
                    {pedido.sin_qr_motivo ? (
                      <span
                        title={pedido.sin_qr_motivo}
                        className="ml-1.5 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800 align-middle"
                      >
                        sin QR
                      </span>
                    ) : null}
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
            {
              encabezado: "Cobro",
              soloEscritorio: true,
              celda: (pedido) => (
                <TextoCobro
                  estado={pedido.estado}
                  formaPago={pedido.forma_pago}
                  cobradoEn={pedido.cobrado_en}
                />
              ),
            },
            { encabezado: "Fecha", celda: (pedido) => formatearFechaHora(pedido.fecha) },
            {
              encabezado: "Vendedor",
              celda: (pedido) =>
                (vendedores ?? []).find((v) => v.id === pedido.vendedor_id)?.nombre ?? "—",
            },
            { encabezado: "Total", celda: (pedido) => formatearPrecio(Number(pedido.total)) },
          ]}
        />
      )}

      <p className="text-sm text-stone-500">
        {(pedidos ?? []).length} pedidos · {formatearPrecio(totalPeriodo)} en total
      </p>
    </>
  );
}
