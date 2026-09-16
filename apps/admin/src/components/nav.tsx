"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cerrarSesion } from "@/lib/sesion";

const SECCIONES = [
  { href: "/comercios", etiqueta: "Comercios" },
  { href: "/mapa", etiqueta: "Mapa" },
  { href: "/productos", etiqueta: "Productos" },
  // La planilla para armar vive adentro, como una solapa: es el mismo dato
  // con otro recorte, y tenerla aparte obligaba a elegir en el menú antes de
  // saber qué se venía a hacer.
  { href: "/pedidos", etiqueta: "Pedidos" },
  { href: "/cobertura", etiqueta: "Cobertura" },
  // Estadísticas, Comisiones y Reporte eran tres secciones que contestaban
  // casi lo mismo, cada una con su propio selector de fecha. Ahora es una.
  { href: "/numeros", etiqueta: "Números" },
  { href: "/usuarios", etiqueta: "Usuarios" },
];

export function Nav({ nombre }: { nombre: string }) {
  const rutaActual = usePathname();

  return (
    <header className="border-b border-stone-200 bg-white print:hidden">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="font-semibold text-stone-900">
          La Buena Medida
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-stone-500 sm:inline">{nombre}</span>
          <form action={cerrarSesion}>
            <button type="submit" className="text-sm text-stone-500 underline hover:text-stone-900">
              Salir
            </button>
          </form>
        </div>
      </div>

      {/* En el celular las secciones no entran todas: se arrastran de costado
          en vez de apilarse en tres renglones y comerse media pantalla. */}
      <nav className="mx-auto w-full max-w-5xl overflow-x-auto px-4 pb-2 sm:px-6">
        <div className="flex w-max gap-1">
          {SECCIONES.map((seccion) => {
            const activa = rutaActual.startsWith(seccion.href);
            return (
              <Link
                key={seccion.href}
                href={seccion.href}
                aria-current={activa ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                  activa
                    ? "bg-stone-900 text-white"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                {seccion.etiqueta}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
