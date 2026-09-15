import { redirect } from "next/navigation";

/** La descarga se mudó a /planilla/excel; un enlace viejo sigue bajando el Excel. */
export async function GET(request: Request) {
  const consulta = new URL(request.url).search;
  redirect(`/planilla/excel${consulta}`);
}
