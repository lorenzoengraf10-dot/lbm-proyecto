import { estilos, Mensaje } from "@/components/ui";
import { listarRepartidores } from "./actions";
import { FormularioLogin } from "./formulario";

// Sin esto Next la prerenderiza en el build: la lista de repartidores se
// consultaría una sola vez, sin base, y la pantalla quedaría para siempre con
// "todavía no hay repartidores cargados".
export const dynamic = "force-dynamic";

export default async function PaginaLogin() {
  // Esta pantalla es la puerta de entrada de toda la app: si algo falla acá
  // (falta una variable de entorno, Supabase no responde un instante) no
  // puede mostrar la pantalla de error genérica del navegador, en inglés y
  // sin decir qué pasa — es lo primero que ve el repartidor en el local,
  // sin forma de saber que tiene que avisarle al dueño ni por qué.
  let repartidores: Awaited<ReturnType<typeof listarRepartidores>> = [];
  let error: string | null = null;
  try {
    repartidores = await listarRepartidores();
  } catch {
    error = "No se pudo conectar. Probá de nuevo en un rato, o avisale al dueño.";
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className={`${estilos.tarjeta} w-full max-w-xs space-y-6 p-6`}>
        <p className="text-center text-sm font-medium text-stone-900">La Buena Medida</p>
        {error ? <Mensaje tipo="error">{error}</Mensaje> : <FormularioLogin repartidores={repartidores} />}
      </div>
    </main>
  );
}
