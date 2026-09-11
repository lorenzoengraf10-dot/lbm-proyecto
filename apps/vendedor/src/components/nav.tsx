"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cerrarSesion } from "@/lib/sesion";
import { useDatosLocales } from "./datos-locales";

const PESTAÑAS = [
  { href: "/comercios", etiqueta: "Comercios" },
  { href: "/escanear", etiqueta: "Escanear" },
  { href: "/mis-pedidos", etiqueta: "Mis pedidos" },
  { href: "/resumen", etiqueta: "Resumen" },
];

export function EncabezadoSuperior({ nombre }: { nombre: string }) {
  const { hayConexion, cola } = useDatosLocales();

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
          {hayConexion
            ? `Subiendo ${cola.length} ${cola.length === 1 ? "pedido" : "pedidos"} pendiente${
                cola.length === 1 ? "" : "s"
              }…`
            : `Sin señal — se guarda todo en el celular${
                cola.length > 0 ? ` (${cola.length} sin subir)` : ""
              }`}
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
            className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
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
