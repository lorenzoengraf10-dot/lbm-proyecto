import { leerParametrosPlanilla, nombreArchivoPlanilla } from "@lbm/shared";
// Por ruta profunda y no desde el barril: excelPlanilla arrastra exceljs y
// server-only, y desde el barril terminarían en el bundle del navegador.
import { excelPlanilla } from "@lbm/shared/src/excel-planilla";
import { planillaDelRepartidor } from "@/lib/planilla-repartidor";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: Request) {
  const parametros = new URL(request.url).searchParams;
  // La misma lectura que la pantalla y que el panel del dueño.
  const { rango, opciones } = leerParametrosPlanilla({
    desde: parametros.get("desde") ?? undefined,
    hasta: parametros.get("hasta") ?? undefined,
    solo: parametros.get("solo") ?? undefined,
    falta: parametros.get("falta") ?? undefined,
    dia: parametros.get("dia") ?? undefined,
  });

  // El guard va acá adentro: verifica quién llama antes de tocar el cliente
  // de servicio (ver planilla-repartidor.ts).
  const planilla = await planillaDelRepartidor(rango, opciones);
  // sinPesos: esta es la hoja que baja el repartidor. Con los montos sería la
  // facturación del día de todo el negocio, que es justo lo que los dueños no
  // quieren que vea. Sin ellos sigue sirviendo para lo que la usa: qué hay que
  // cortar y para quién.
  const excel = await excelPlanilla(planilla, { sinPesos: true });

  return new Response(excel as BodyInit, {
    headers: {
      "content-type": TIPO_XLSX,
      "content-disposition": `attachment; filename="${nombreArchivoPlanilla(rango, opciones)}"`,
      // Sin caché: los pedidos del día cambian todo el tiempo.
      "cache-control": "no-store",
    },
  });
}
