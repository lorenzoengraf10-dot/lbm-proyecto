const formatoPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

export function formatearPrecio(valor: number): string {
  return formatoPrecio.format(valor);
}

/** 3.00 -> "3%", 2.50 -> "2,5%" */
export function formatearComision(valor: number | null): string {
  if (valor === null) return "—";
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(valor)}%`;
}
