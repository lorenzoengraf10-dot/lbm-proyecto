import { redirect } from "next/navigation";

/**
 * Comisiones se unificó en Números, donde la tabla "Por repartidor" es la
 * misma más lo vendido. El tramo de fechas se llama igual, así que pasa tal cual.
 */
export default async function ComisionesSeUnificaron({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { desde, hasta } = await searchParams;
  const partes = new URLSearchParams();
  if (desde) partes.set("desde", desde);
  if (hasta) partes.set("hasta", hasta);
  const consulta = partes.toString();
  redirect(consulta ? `/numeros?${consulta}` : "/numeros");
}
