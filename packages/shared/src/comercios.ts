export const LARGO_MAXIMO_CODIGO = 20;

// Ordenar por texto deja CP1, CP10, CP11… CP2, CP20: para una cartera de CP1 a
// CP100 eso es un desastre a la hora de buscar un comercio en la lista o de
// repartir los carteles impresos en orden. El comparador numérico de Intl
// entiende que el 2 de CP2 va antes que el 10 de CP10.
const comparadorCodigos = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export function compararCodigosComercio(a: string, b: string): number {
  return comparadorCodigos.compare(a, b);
}

/** Ordena por código con criterio humano (CP2 antes que CP10). */
export function ordenarPorCodigo<T extends { codigo: string }>(comercios: T[]): T[] {
  return [...comercios].sort((a, b) => compararCodigosComercio(a.codigo, b.codigo));
}

export function normalizarCodigoComercio(codigo: string): string {
  return codigo.trim().toUpperCase();
}

// Deliberadamente permisiva: los códigos vienen del sistema viejo del negocio
// (CP1, V13) y no conviene rechazar datos reales por un formato inventado acá.
export function validarCodigoComercio(codigo: string): string | null {
  const normalizado = normalizarCodigoComercio(codigo);

  if (!normalizado) {
    return "El código no puede estar vacío.";
  }
  if (normalizado.length > LARGO_MAXIMO_CODIGO) {
    return `El código no puede tener más de ${LARGO_MAXIMO_CODIGO} caracteres.`;
  }
  if (/\s/.test(normalizado)) {
    return "El código no puede tener espacios.";
  }
  return null;
}
