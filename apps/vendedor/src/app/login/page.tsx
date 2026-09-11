import { estilos } from "@/components/ui";
import { FormularioLogin } from "./formulario";

export default function PaginaLogin() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className={`${estilos.tarjeta} w-full max-w-sm space-y-6 p-6`}>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-stone-900">La Buena Medida</h1>
          <p className="text-sm text-stone-500">Ingresá con tu usuario y contraseña.</p>
        </div>
        <FormularioLogin />
      </div>
    </main>
  );
}
