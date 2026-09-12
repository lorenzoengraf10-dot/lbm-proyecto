import { estilos } from "@/components/ui";
import { listarRepartidores } from "./actions";
import { FormularioLogin } from "./formulario";

// Sin esto Next la prerenderiza en el build: la lista de repartidores se
// consultaría una sola vez, sin base, y la pantalla quedaría para siempre con
// "todavía no hay repartidores cargados".
export const dynamic = "force-dynamic";

export default async function PaginaLogin() {
  const repartidores = await listarRepartidores();

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className={`${estilos.tarjeta} w-full max-w-xs space-y-6 p-6`}>
        <p className="text-center text-sm font-medium text-stone-900">La Buena Medida</p>
        <FormularioLogin repartidores={repartidores} />
      </div>
    </main>
  );
}
