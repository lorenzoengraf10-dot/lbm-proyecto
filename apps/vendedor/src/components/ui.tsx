import type { ReactNode } from "react";

export const estilos = {
  input:
    "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 outline-none focus:border-stone-600",
  boton:
    "rounded-md bg-stone-900 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50",
  botonSecundario:
    "rounded-md border border-stone-300 bg-white px-4 py-3 text-base text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50",
  tarjeta: "rounded-lg border border-stone-200 bg-white shadow-sm",
  etiqueta: "block text-sm font-medium text-stone-700",
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

export function EstadoVacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-stone-500">{children}</p>;
}
