import { estilos } from "@/components/ui";
import { FormularioLogin } from "./formulario";

export default function PaginaLogin() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className={`${estilos.tarjeta} w-full max-w-sm p-6`}>
        <h1 className="text-lg font-semibold text-stone-900">La Buena Medida</h1>
        <p className="mt-1 mb-6 text-sm text-stone-500">Panel de administración</p>
        <FormularioLogin />
      </div>
    </main>
  );
}
