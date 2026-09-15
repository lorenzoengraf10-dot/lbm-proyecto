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
  //
  // Y tampoco puede tapar el formulario entero: el login por contraseña usa
  // supabase.auth directo, sin la clave de servicio, así que sigue andando
  // aunque esta consulta falle. Por eso el error no reemplaza el formulario,
  // solo se avisa arriba — con la lista vacía, FormularioLogin ya sabe ir
  // directo a usuario y contraseña, que es exactamente lo que hace falta acá.
  let admins: Awaited<ReturnType<typeof listarAdmins>> = [];
  let aviso: string | null = null;
  try {
    admins = await listarAdmins();
  } catch {
    aviso = "No se pudo cargar la lista de nombres. Entrá con tu usuario y contraseña.";
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className={`${estilos.tarjeta} w-full max-w-xs p-6`}>
        <h1 className="text-center text-lg font-semibold text-stone-900">La Buena Medida</h1>
        <p className="mb-6 text-center text-sm text-stone-500">Panel de administración</p>
        {aviso ? (
          <div className="mb-4">
            <Mensaje tipo="error">{aviso}</Mensaje>
          </div>
        ) : null}
        <FormularioLogin admins={admins} />
      </div>
    </main>
  );
}
