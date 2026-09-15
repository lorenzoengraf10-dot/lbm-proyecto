/**
 * La unidad de medida se escribe a mano en el catálogo ("kg", "unidad",
 * "Unidades", "un"), así que para agrupar y totalizar hay que llevarla a una
 * forma sola. Lo que no se reconoce se respeta tal cual: si el dueño inventa
 * una unidad nueva, la planilla la muestra igual en vez de tragársela.
 */
const CONOCIDAS: { clave: string; corta: string; formas: string[] }[] = [
  { clave: "kg", corta: "kg", formas: ["kg", "kg.", "kilo", "kilos", "kilogramo", "kilogramos"] },
  { clave: "un", corta: "un.", formas: ["u", "un", "un.", "uni", "unidad", "unidades"] },
  { clave: "doc", corta: "doc.", formas: ["doc", "doc.", "docena", "docenas"] },
  { clave: "band", corta: "band.", formas: ["band", "bandeja", "bandejas"] },
];

function limpiar(unidad: string): string {
  return unidad.trim().toLowerCase();
}

/** La misma unidad escrita de cualquier forma cae siempre en la misma clave. */
export function claveUnidad(unidad: string): string {
  const limpia = limpiar(unidad);
  return CONOCIDAS.find((u) => u.formas.includes(limpia))?.clave ?? limpia;
}

/** Cómo se escribe esa unidad en un encabezado: corta, para que entre. */
export function unidadCorta(unidad: string): string {
  const limpia = limpiar(unidad);
  const conocida = CONOCIDAS.find((u) => u.formas.includes(limpia));
  if (conocida) return conocida.corta;
  return limpia.length > 5 ? `${limpia.slice(0, 4)}.` : limpia;
}

/** Lo que se vende por peso, que es lo único que se puede sumar en kilos. */
export function esKilo(unidad: string): boolean {
  return claveUnidad(unidad) === "kg";
}

/** El kilo primero, que es el grueso del negocio; el resto por orden alfabético. */
export function ordenarUnidades(claves: string[]): string[] {
  return [...claves].sort((a, b) => {
    if (a === "kg") return -1;
    if (b === "kg") return 1;
    return a.localeCompare(b, "es");
  });
}
