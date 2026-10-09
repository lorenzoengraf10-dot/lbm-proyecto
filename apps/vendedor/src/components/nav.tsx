"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cerrarSesion } from "@/lib/sesion";
import { useDatosLocales } from "./datos-locales";

// Cargar un pedido es lo que el repartidor hace todo el día; el resto es
// para mirar. Y desde que el pedido solo se carga escaneando, eso arranca en
// la cámara: va primera, y es donde abre la app. Atrás queda el listado, que
// sirve para buscar un comercio o para cargar sin QR cuando el cartel no está
// — se llama por lo que hace ahí y no por lo que muestra, porque "Comercios"
// no decía que ahí se carga el pedido.
const PESTAÑAS = [
  { href: "/escanear", etiqueta: "Escanear" },
  { href: "/comercios", etiqueta: "Pedido" },
  { href: "/mis-pedidos", etiqueta: "Mis pedidos" },
  { href: "/planilla", etiqueta: "Planilla" },
  { href: "/resumen", etiqueta: "Resumen" },
  // Última: sirve para armar el recorrido, pero no es lo de todo el día.
  { href: "/mapa", etiqueta: "Mapa" },
];

export function EncabezadoSuperior({ nombre }: { nombre: string }) {
  const { hayConexion, cola } = useDatosLocales();
  const rechazados = cola.filter((pendiente) => pendiente.error).length;

  return (
    <header className="sticky top-0 z-10 border-b border-stone-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm font-semibold text-stone-900">La Buena Medida</span>
        <div className="flex items-center gap-3">
          {nombre ? <span className="text-sm text-stone-500">{nombre}</span> : null}
          <form action={cerrarSesion}>
            <button
              type="submit"
              disabled={!hayConexion}
              className="text-sm text-stone-500 underline disabled:no-underline disabled:opacity-40"
            >
              Salir
            </button>
          </form>
        </div>
      </div>

      {!hayConexion || cola.length > 0 ? (
        <p
          className={`px-4 py-1.5 text-xs ${
            hayConexion ? "bg-amber-50 text-amber-800" : "bg-stone-800 text-stone-100"
          }`}
        >
          {/* Un pedido rechazado no se sube solo por más señal que haya:
              decir "Subiendo…" para siempre escondía que hay que hacer algo. */}
          {hayConexion && rechazados > 0 ? (
            <Link href="/mis-pedidos" className="underline">
              {rechazados === 1
                ? "1 pedido no se pudo subir — tocá para ver por qué"
                : `${rechazados} pedidos no se pudieron subir — tocá para ver por qué`}
            </Link>
          ) : hayConexion ? (
            `Subiendo ${cola.length} ${cola.length === 1 ? "pedido" : "pedidos"} pendiente${
              cola.length === 1 ? "" : "s"
            }…`
          ) : (
            `Sin señal — se guarda todo en el celular${
              cola.length > 0 ? ` (${cola.length} sin subir)` : ""
            }`
          )}
        </p>
      ) : null}
    </header>
  );
}

export function BarraInferior() {
  const rutaActual = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {PESTAÑAS.map((pestaña) => {
        const activa = rutaActual.startsWith(pestaña.href);
        return (
          <Link
            key={pestaña.href}
            href={pestaña.href}
            aria-current={activa ? "page" : undefined}
            // Letra un punto más chica en celulares angostos: con seis pestañas,
            // a 360 px los nombres quedaban pegados uno al otro.
            className={`min-w-0 flex-1 px-0.5 py-3 text-center text-xs font-medium transition-colors min-[400px]:text-sm ${
              activa ? "text-stone-900" : "text-stone-400"
            }`}
          >
            {pestaña.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
