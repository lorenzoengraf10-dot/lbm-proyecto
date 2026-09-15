import { requerirAdmin } from "@/lib/auth";
import { excelPlanilla } from "@/lib/excel-planilla";
import { diaArgentina, diaValido, rangoDelDia } from "@/lib/fechas";
import { armarPlanilla } from "@/lib/planilla";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: Request) {
  // Es un endpoint propio, no una página: el guard va acá también.
  const { supabase } = await requerirAdmin();

  const parametros = new URL(request.url).searchParams;
  const dia = diaValido(parametros.get("dia")) ?? diaArgentina();
  const soloQuePidieron = parametros.get("solo") === "1";

  const planilla = await armarPlanilla(supabase, rangoDelDia(dia), { soloQuePidieron });
  const excel = await excelPlanilla(planilla);

  return new Response(excel as BodyInit, {
    headers: {
      "content-type": TIPO_XLSX,
      "content-disposition": `attachment; filename="lbm-pedidos-${dia}.xlsx"`,
      // Sin caché: los pedidos del día cambian todo el tiempo.
      "cache-control": "no-store",
    },
  });
}
