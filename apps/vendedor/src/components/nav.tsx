"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cerrarSesion } from "@/lib/sesion";

const PESTAÑAS = [
  { href: "/comercios", etiqueta: "Comercios" },
  { href: "/escanear", etiqueta: "Escanear" },
  { href: "/mis-pedidos", etiqueta: "Mis pedidos" },
];

export function EncabezadoSuperior({ nombre }: { nombre: string }) {
  return (
    <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-2">
      <span className="text-sm font-semibold text-stone-900">La Buena Medida</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-stone-500">{nombre}</span>
        <form action={cerrarSesion}>
          <button type="submit" className="text-sm text-stone-500 underline">
            Salir
          </button>
        </form>
      </div>
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
