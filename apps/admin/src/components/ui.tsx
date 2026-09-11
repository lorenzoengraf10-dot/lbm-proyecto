import type { ReactNode } from "react";

export const estilos = {
  input:
    "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-600",
  boton:
    "rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50",
  botonSecundario:
    "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50",
  botonPeligro:
    "rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50",
  tarjeta: "rounded-lg border border-stone-200 bg-white shadow-sm",
  etiqueta: "block text-sm font-medium text-stone-700",
  celda: "px-4 py-3 text-sm text-stone-700",
  encabezadoCelda: "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500",
};

export function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className={estilos.etiqueta}>{etiqueta}</span>
      {children}
      {ayuda ? <span className="block text-xs text-stone-500">{ayuda}</span> : null}
    </label>
  );
}

export function Mensaje({ tipo, children }: { tipo: "error" | "ok"; children: ReactNode }) {
  const clases =
    tipo === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <p
      role={tipo === "error" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2 text-sm ${clases}`}
    >
      {children}
    </p>
  );
}

export function SoloLectores({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function Etiqueta({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        activo ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"
      }`}
    >
      {activo ? "Activo" : "Dado de baja"}
    </span>
  );
}

export function EstadoVacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-stone-500">{children}</p>;
}

/**
 * El esqueleto que se ve mientras la página va a buscar los datos. Sin esto
 * el panel se queda con la pantalla anterior congelada y parece colgado,
 * sobre todo con los datos móviles del pueblo.
 */
export function Cargando({ filas = 5 }: { filas?: number }) {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true">
      <div className="h-6 w-40 rounded bg-stone-200" />
      <div className={`${estilos.tarjeta} divide-y divide-stone-100`}>
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-4 py-4">
            <div className="h-4 w-1/3 rounded bg-stone-200" />
            <div className="h-4 w-16 rounded bg-stone-100" />
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
