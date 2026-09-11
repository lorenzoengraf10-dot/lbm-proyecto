import { requerirAdmin } from "@/lib/auth";
import { pdfSemanal } from "@/lib/pdf-semanal";
import { armarReporteSemanal } from "@/lib/reporte-semanal";
import { lunesDe, semanaActual, semanaDesdeLunes } from "@/lib/semana";

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  // Es un endpoint propio, no una página: el guard va acá también.
  const { supabase } = await requerirAdmin();

  const pedido = new URL(request.url).searchParams.get("semana");
  const semana = pedido && FORMATO_DIA.test(pedido) ? semanaDesdeLunes(lunesDe(pedido)) : semanaActual();

  const reporte = await armarReporteSemanal(supabase, semana);
  const pdf = await pdfSemanal(semana, reporte);

  return new Response(pdf as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="lbm-semana-${semana.lunes}.pdf"`,
      // Sin caché: los pedidos de la semana en curso cambian todo el tiempo.
      "cache-control": "no-store",
    },
  });
}
