"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cerrarSesion } from "@/lib/sesion";

const SECCIONES = [
  { href: "/comercios", etiqueta: "Comercios" },
  { href: "/productos", etiqueta: "Productos" },
  { href: "/pedidos", etiqueta: "Pedidos" },
  { href: "/cobertura", etiqueta: "Cobertura" },
  { href: "/comisiones", etiqueta: "Comisiones" },
  { href: "/reportes", etiqueta: "Reporte" },
  { href: "/usuarios", etiqueta: "Usuarios" },
];

export function Nav({ nombre }: { nombre: string }) {
  const rutaActual = usePathname();

  return (
    <header className="border-b border-stone-200 bg-white print:hidden">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <span className="font-semibold text-stone-900">La Buena Medida</span>

        <nav className="flex gap-1">
          {SECCIONES.map((seccion) => {
            const activa = rutaActual.startsWith(seccion.href);
            return (
              <Link
                key={seccion.href}
                href={seccion.href}
                aria-current={activa ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  activa
                    ? "bg-stone-900 text-white"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                {seccion.etiqueta}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-stone-500">{nombre}</span>
          <form action={cerrarSesion}>
            <button type="submit" className="text-sm text-stone-500 underline hover:text-stone-900">
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
