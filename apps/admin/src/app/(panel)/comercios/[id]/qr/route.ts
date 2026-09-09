import { requerirAdmin } from "@/lib/auth";
import { cartelQr, nombreArchivoQr } from "@/lib/qr";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requerirAdmin();
  const { id } = await params;

  const { data: comercio } = await supabase
    .from("comercios")
    .select("codigo, nombre, localidad")
    .eq("id", id)
    .maybeSingle();

  if (!comercio) {
    return new Response("No se encontró el comercio.", { status: 404 });
  }

  return new Response(cartelQr(comercio), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "content-disposition": `attachment; filename="${nombreArchivoQr(comercio.codigo)}"`,
      "cache-control": "no-store",
    },
  });
}
