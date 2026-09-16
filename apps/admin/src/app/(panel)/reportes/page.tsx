import { redirect } from "next/navigation";
import { semanaActual, semanaDeDia } from "@/lib/semana";

/**
 * El reporte se unificó en Números.
 *
 * La semana que traía se traduce a su tramo de fechas, así un enlace a una
 * semana vieja sigue mostrando esa semana. El PDF no se movió: sigue en
 * /reportes/semanal, que es hijo de esta ruta y no se pisa con el reenvío.
 */
export default async function ReporteSeUnifico({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const { semana: pedida } = await searchParams;
  const semana = (pedida ? semanaDeDia(pedida) : null) ?? semanaActual();
  redirect(`/numeros?desde=${semana.lunes}&hasta=${semana.domingo}`);
}
