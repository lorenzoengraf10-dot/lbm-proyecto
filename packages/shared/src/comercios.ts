export const LARGO_MAXIMO_CODIGO = 20;

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
