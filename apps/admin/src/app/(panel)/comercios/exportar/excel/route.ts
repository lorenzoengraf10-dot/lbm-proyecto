import { requerirAdmin } from "@/lib/auth";
import { excelPlanillaDia } from "@/lib/excel-planilla";
import { diaArgentina, diaValido } from "@/lib/fechas";
import { armarPlanillaDia } from "@/lib/planilla-dia";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: Request) {
  // Es un endpoint propio, no una página: el guard va acá también.
  const { supabase } = await requerirAdmin();

  const parametros = new URL(request.url).searchParams;
  const dia = diaValido(parametros.get("dia")) ?? diaArgentina();
  const soloQuePidieron = parametros.get("solo") === "1";

  const planilla = await armarPlanillaDia(supabase, dia, soloQuePidieron);
  const excel = await excelPlanillaDia(planilla);

  return new Response(excel as BodyInit, {
    headers: {
      "content-type": TIPO_XLSX,
      "content-disposition": `attachment; filename="lbm-pedidos-${dia}.xlsx"`,
      // Sin caché: los pedidos del día cambian todo el tiempo.
      "cache-control": "no-store",
    },
  });
}
