import { BotonEnviar } from "@/components/boton-enviar";
import { estilos } from "@/components/ui";
import { cerrarSesion } from "@/lib/sesion";

export default function PaginaSinAcceso() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className={`${estilos.tarjeta} w-full max-w-sm space-y-4 p-6`}>
        <h1 className="text-lg font-semibold text-stone-900">Sin acceso</h1>
        <p className="text-sm text-stone-600">
          Esta cuenta no tiene permisos de administrador. Si necesitás entrar al panel,
          pedile a un administrador que revise tu usuario.
        </p>
        <form action={cerrarSesion}>
          <BotonEnviar>Cerrar sesión</BotonEnviar>
        </form>
      </div>
    </main>
  );
}
