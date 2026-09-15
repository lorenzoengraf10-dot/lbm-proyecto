import { redirect } from "next/navigation";

/**
 * La planilla se mudó a /planilla, pero esta es la dirección que se usó todos
 * los días durante meses y puede estar guardada en favoritos o en el historial.
 * Sin este archivo no queda ni un 404 decente: "exportar" se lo come la ruta
 * /comercios/[id] y sale la pantalla en inglés del navegador.
 *
 * Se lleva los parámetros puestos (?dia=, ?solo=) para que un enlace completo
 * siga mostrando lo mismo que mostraba.
 */
export default async function ExportarSeMudo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(await searchParams)) {
    if (typeof valor === "string") parametros.set(clave, valor);
  }
  const consulta = parametros.toString();
  redirect(consulta ? `/planilla?${consulta}` : "/planilla");
}
