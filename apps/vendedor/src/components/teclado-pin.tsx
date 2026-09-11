"use client";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export function TecladoPin({
  valor,
  onCambiar,
  largo,
  disabled,
}: {
  valor: string;
  onCambiar: (valor: string) => void;
  largo: number;
  disabled?: boolean;
}) {
  function tocar(tecla: string) {
    if (disabled || !tecla) return;
    if (tecla === "⌫") {
      onCambiar(valor.slice(0, -1));
    } else if (valor.length < largo) {
      onCambiar(valor + tecla);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-center gap-3" aria-hidden>
        {Array.from({ length: largo }, (_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-stone-400 ${
              i < valor.length ? "border-stone-900 bg-stone-900" : "bg-transparent"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {TECLAS.map((tecla, i) => (
          <button
            key={i}
            type="button"
            tabIndex={tecla ? 0 : -1}
            disabled={disabled || !tecla}
            onClick={() => tocar(tecla)}
            className={
              tecla
                ? "rounded-full bg-white py-4 text-xl font-medium text-stone-900 shadow-sm transition-colors active:bg-stone-100 disabled:opacity-50"
                : "pointer-events-none"
            }
          >
            {tecla}
          </button>
        ))}
      </div>
    </div>
  );
}
