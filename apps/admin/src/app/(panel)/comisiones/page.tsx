import Link from "next/link";
import { Tabla } from "@/components/tabla";
import { EstadoVacio, Etiqueta, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { formatearComision, formatearPrecio } from "@/lib/formato";

export default async function PaginaComisiones({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { desde, hasta } = await searchParams;

  const [{ data: vendedores }, consultaPedidos] = await Promise.all([
    supabase.from("usuarios").select("id, nombre, comision_pct, activo").eq("rol", "vendedor").order("nombre"),
    (() => {
      // Solo los completados: la comisión se gana cuando el pedido se entregó
      // y se cobró, no cuando se tomó. Y se trae comision_pct del PEDIDO, que
      // es el porcentaje congelado al crearlo — si el dueño se lo cambió al
      // vendedor, lo ya ganado no se mueve.
      let consulta = supabase
        .from("pedidos")
        .select("vendedor_id, total, comision_pct")
        .eq("estado", "completado");
      if (desde) consulta = consulta.gte("fecha", desde);
      if (hasta) consulta = consulta.lte("fecha", `${hasta}T23:59:59`);
      return consulta;
    })(),
  ]);

  const { data: pedidos, error } = consultaPedidos;

  // pedidos.total es numeric(10,2): PostgREST lo manda como string ("6400.00")
  // para no perder precisión. Sumarlo con + sin convertir concatenaría texto
  // en vez de sumar números.
  const porVendedor = new Map<
    string,
    { cantidad: number; totalVendido: number; comision: number; porcentajes: Set<number> }
  >();
  for (const pedido of pedidos ?? []) {
    const actual = porVendedor.get(pedido.vendedor_id) ?? {
      cantidad: 0,
      totalVendido: 0,
      comision: 0,
      porcentajes: new Set<number>(),
    };
    const total = Number(pedido.total);
    const pct = Number(pedido.comision_pct);
    actual.cantidad += 1;
    actual.totalVendido += total;
    // Pedido por pedido, cada uno con su porcentaje: un período que cruza un
    // cambio de comisión suma bien las dos mitades.
    actual.comision += (total * pct) / 100;
    actual.porcentajes.add(pct);
    porVendedor.set(pedido.vendedor_id, actual);
  }

  const filas = (vendedores ?? []).map((v) => {
    const resumen = porVendedor.get(v.id) ?? {
      cantidad: 0,
      totalVendido: 0,
      comision: 0,
      porcentajes: new Set<number>(),
    };
    const porcentajes = [...resumen.porcentajes].sort((a, b) => a - b);
    return {
      ...v,
      cantidad: resumen.cantidad,
      totalVendido: resumen.totalVendido,
      comision: resumen.comision,
      // Sin pedidos en el período se muestra el porcentaje que tiene hoy.
      porcentajes: porcentajes.length > 0 ? porcentajes : [Number(v.comision_pct)],
    };
  });

  const totalGeneral = filas.reduce((acumulado, fila) => acumulado + fila.totalVendido, 0);
  const comisionGeneral = filas.reduce((acumulado, fila) => acumulado + fila.comision, 0);

  return (
    <>
      <h1 className="text-xl font-semibold text-stone-900">Comisiones</h1>

      <form className="flex flex-wrap items-end gap-3">
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
        {desde || hasta ? (
          <Link href="/comisiones" className="text-sm text-stone-500 underline hover:text-stone-900">
            Sacar filtros
          </Link>
        ) : null}
        <span className="text-sm text-stone-500">
          {desde || hasta ? "" : "Sin filtro: totales de todo el historial."}
        </span>
      </form>

      <p className="text-xs text-stone-500">
        Cuenta solo los pedidos entregados. Cada pedido usa el porcentaje que tenía el vendedor
        cuando se cargó, así cambiarle la comisión no mueve lo ya ganado.
      </p>

      {error ? (
        <div className={`${estilos.tarjeta} overflow-hidden`}>
          <EstadoVacio>No se pudieron cargar los pedidos: {error.message}</EstadoVacio>
        </div>
      ) : (
        <Tabla
          filas={filas}
          clave={(fila) => fila.id}
          vacio="Todavía no hay vendedores cargados."
          columnas={[
            {
              encabezado: "Vendedor",
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
                // Si en el período hubo un cambio de porcentaje, se muestran
                // los dos en vez de un número que no explicaría el total.
                fila.porcentajes.map((pct) => formatearComision(pct)).join(" y "),
            },
            { encabezado: "Pedidos", celda: (fila) => fila.cantidad },
            { encabezado: "Total vendido", celda: (fila) => formatearPrecio(fila.totalVendido) },
            { encabezado: "A pagar", celda: (fila) => formatearPrecio(fila.comision) },
          ]}
          pie={[
            { etiqueta: "Total vendido", valor: formatearPrecio(totalGeneral) },
            { etiqueta: "A pagar", valor: formatearPrecio(comisionGeneral) },
          ]}
        />
      )}
    </>
  );
}
