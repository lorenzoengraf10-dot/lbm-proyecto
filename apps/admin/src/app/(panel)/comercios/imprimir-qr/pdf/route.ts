import { ordenarPorCodigo } from "@lbm/shared";
import { requerirAdmin } from "@/lib/auth";
import { diaArgentina } from "@/lib/fechas";
import { pdfCartelesQr } from "@/lib/pdf-qr";

export async function GET(request: Request) {
  // Es un endpoint propio, no una página: el guard va acá también.
  const { supabase } = await requerirAdmin();

  // Por defecto solo los activos, que es lo que se va a pegar en la calle.
  // ?incluir=todos agrega los dados de baja, por si hace falta reimprimir uno.
  const incluirTodos = new URL(request.url).searchParams.get("incluir") === "todos";

  let consulta = supabase.from("comercios").select("codigo, nombre, localidad").order("codigo");
  if (!incluirTodos) consulta = consulta.eq("activo", true);

  const { data: comercios, error } = await consulta;
  if (error) {
    return new Response(`No se pudieron cargar los comercios: ${error.message}`, { status: 500 });
  }

  // Orden humano: CP2 antes que CP10, para repartir los carteles en orden.
  const pdf = await pdfCartelesQr(ordenarPorCodigo(comercios ?? []));

  return new Response(pdf as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="lbm-qr-${diaArgentina()}.pdf"`,
      // Sin caché: la cartera cambia cuando se dan de alta comercios nuevos.
      "cache-control": "no-store",
    },
  });
}
