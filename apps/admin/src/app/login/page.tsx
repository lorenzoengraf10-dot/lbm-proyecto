import { estilos, Mensaje } from "@/components/ui";
import { listarAdmins } from "./actions";
import { FormularioLogin } from "./formulario";

// Sin esto Next la prerenderiza en el build y la lista de administradores
// quedaría congelada (vacía) para siempre.
export const dynamic = "force-dynamic";

export default async function PaginaLogin() {
  // Esta pantalla es la puerta de entrada de todo el panel: si algo falla acá
  // (falta una variable de entorno, Supabase no responde un instante) no
  // puede mostrar la pantalla de error genérica del navegador, en inglés y
  // sin decir qué pasa.
  let admins: Awaited<ReturnType<typeof listarAdmins>> = [];
  let error: string | null = null;
  try {
    admins = await listarAdmins();
  } catch {
    error = "No se pudo conectar. Probá de nuevo en un rato.";
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className={`${estilos.tarjeta} w-full max-w-xs p-6`}>
        <h1 className="text-center text-lg font-semibold text-stone-900">La Buena Medida</h1>
        <p className="mb-6 text-center text-sm text-stone-500">Panel de administración</p>
        {error ? <Mensaje tipo="error">{error}</Mensaje> : <FormularioLogin admins={admins} />}
      </div>
    </main>
  );
}
