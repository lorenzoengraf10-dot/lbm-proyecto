import Link from "next/link";
import { diaArgentina, leerParametrosPlanilla, mesDesdeValor } from "@lbm/shared";
import { requerirAdmin } from "@/lib/auth";
import { VISTA_ARMAR, esVistaDeArmado, type ParametrosPedidos } from "./parametros";
import { VistaLista } from "./vista-lista";
import { VistaParaArmar } from "./vista-planilla";

/**
 * Los pedidos, en dos maneras de mirar lo mismo.
 *
 * Antes eran dos secciones del menú, y eso obligaba a elegir cuál abrir antes
 * de saber qué se venía a hacer: "Pedidos" para revisar uno y "Planilla" para
 * armarlos todos. Son el mismo dato con dos recortes, así que van juntos y se
 * cambia con una solapa, sin volver al menú ni perder el tramo de fechas.
 */
export default async function PaginaPedidos({
  searchParams,
}: {
  searchParams: Promise<ParametrosPedidos>;
}) {
  const { supabase } = await requerirAdmin();
  const parametros = await searchParams;
  const armar = esVistaDeArmado(parametros);

  // El tramo viaja de una solapa a la otra, pero cada una tiene su propio
  // valor por defecto y eso hay que respetarlo: el listado sin fechas es
  // "todo el historial" y la hoja de armado sin fechas es "hoy". Por eso,
  // viniendo de armar se manda el tramo ya resuelto (si no, el listado
  // saltaría de la hoja de hoy a los pedidos de todos los tiempos), y viniendo
  // del listado se manda solo lo que esté puesto de verdad.
  const delMes = parametros.mes ? mesDesdeValor(parametros.mes) : null;
  const tramoDelListado = {
    desde: delMes?.desde ?? parametros.desde,
    hasta: delMes?.hasta ?? parametros.hasta,
  };
  const tramo = armar ? leerParametrosPlanilla(parametros).rango : tramoDelListado;

  const enlace = (vista: string | null) => {
    const partes = new URLSearchParams();
    if (vista) partes.set("ver", vista);
    // Un tramo que es exactamente el día de hoy no se escribe: es el valor por
    // defecto de la hoja de armado y ensuciaría el enlace sin cambiar nada.
    const hoy = diaArgentina();
    if (tramo.desde && tramo.hasta && !(tramo.desde === hoy && tramo.hasta === hoy)) {
      partes.set("desde", tramo.desde);
      partes.set("hasta", tramo.hasta);
    }
    const consulta = partes.toString();
    return consulta ? `/pedidos?${consulta}` : "/pedidos";
  };

  return (
    <>
      <h1 className="text-xl font-semibold text-stone-900">Pedidos</h1>

      <div className="flex gap-1 border-b border-stone-200">
        <Solapa href={enlace(null)} activa={!armar}>
          La lista
        </Solapa>
        <Solapa href={enlace(VISTA_ARMAR)} activa={armar}>
          Para armar
        </Solapa>
      </div>

      {armar ? (
        <VistaParaArmar supabase={supabase} parametros={parametros} />
      ) : (
        <VistaLista supabase={supabase} parametros={parametros} />
      )}
    </>
  );
}

function Solapa({
  href,
  activa,
  children,
}: {
  href: string;
  activa: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // El subrayado grueso y no un color de fondo: en una barra de dos, el
      // fondo se lee como botón y hace dudar de cuál está puesta.
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        activa
          ? "border-stone-900 text-stone-900"
          : "border-transparent text-stone-500 hover:text-stone-900"
      }`}
    >
      {children}
    </Link>
  );
}
