import { armarPlanilla, leerParametrosPlanilla, nombreArchivoPlanilla } from "@lbm/shared";
// Por ruta profunda y no desde el barril: excelPlanilla arrastra exceljs y
// server-only, y desde el barril terminarían en el bundle del navegador.
import { excelPlanilla } from "@lbm/shared/src/excel-planilla";
import { requerirAdmin } from "@/lib/auth";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: Request) {
  // Es un endpoint propio, no una página: el guard va acá también.
  const { supabase } = await requerirAdmin();

  const parametros = new URL(request.url).searchParams;
  // La misma lectura que la pantalla: un día suelto, un tramo, los extremos al
  // revés o basura pura terminan todos en el mismo rango que se está viendo.
  const { rango, opciones } = leerParametrosPlanilla({
    desde: parametros.get("desde") ?? undefined,
    hasta: parametros.get("hasta") ?? undefined,
    solo: parametros.get("solo") ?? undefined,
    falta: parametros.get("falta") ?? undefined,
    dia: parametros.get("dia") ?? undefined,
  });

  const planilla = await armarPlanilla(supabase, rango, opciones);
  const excel = await excelPlanilla(planilla);

  return new Response(excel as BodyInit, {
    headers: {
      "content-type": TIPO_XLSX,
      "content-disposition": `attachment; filename="${nombreArchivoPlanilla(rango, opciones)}"`,
      // Sin caché: los pedidos del día cambian todo el tiempo.
      "cache-control": "no-store",
    },
  });
}
