import { redirect } from "next/navigation";
import type { ParametrosPlanilla } from "@lbm/shared";

/**
 * La planilla se mudó adentro de Pedidos, como una solapa.
 *
 * Esto queda porque /planilla es la dirección que está en los favoritos y
 * pegada en mensajes desde que existe: sin el reenvío, el enlace de todos los
 * días abriría un 404 en inglés. Se lleva los filtros puestos, así que un
 * enlace a un tramo o con "solo lo que falta armar" sigue mostrando lo mismo.
 */
export default async function PlanillaSeMudo({
  searchParams,
}: {
  searchParams: Promise<ParametrosPlanilla>;
}) {
  const parametros = await searchParams;
  const partes = new URLSearchParams({ ver: "armar" });
  for (const [clave, valor] of Object.entries(parametros)) {
    if (typeof valor === "string" && valor) partes.set(clave, valor);
  }
  redirect(`/pedidos?${partes}`);
}
