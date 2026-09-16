import { redirect } from "next/navigation";
import { mesDesdeValor } from "@lbm/shared";

/**
 * Estadísticas se unificó en Números.
 *
 * El reenvío traduce el mes que traía en la URL al tramo de fechas que usa
 * Números: un enlace guardado a "agosto" tiene que seguir mostrando agosto, no
 * todo el historial.
 */
export default async function EstadisticasSeUnificaron({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const rango = mes ? mesDesdeValor(mes) : null;
  redirect(rango ? `/numeros?desde=${rango.desde}&hasta=${rango.hasta}` : "/numeros");
}
