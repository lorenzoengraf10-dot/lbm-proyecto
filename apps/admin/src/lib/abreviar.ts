// Palabras que no distinguen un producto de otro: sacarlas primero deja el
// nombre corto sin perder de qué producto se habla.
const SIN_VALOR = new Set(["de", "del", "la", "el", "los", "las", "con", "y", "a", "en", "por"]);

function palabras(nombre: string): string[] {
  const significativas = nombre
    .trim()
    .split(/\s+/)
    .filter((palabra) => !SIN_VALOR.has(palabra.toLowerCase()));
  // Un nombre que es todo preposiciones no existe, pero si llegara vacío es
  // peor quedarse sin encabezado que dejarlo largo.
  return significativas.length > 0 ? significativas : nombre.trim().split(/\s+/);
}

function recortar(palabra: string, largo: number): string {
  return palabra.length <= largo ? palabra : `${palabra.slice(0, largo - 1)}.`;
}

/**
 * Nombres cortos para los encabezados de la planilla. Con quince productos,
 * un título como "Bondiola ahumada casera" hace una columna de cuatro
 * centímetros y la hoja deja de entrar en un A4.
 *
 * Se acorta lo mínimo necesario: primero la primera palabra sola, y solo si
 * dos productos quedarían con el mismo nombre se agrega lo que los distingue.
 * Mejor "Salame fino" y "Salame grueso" que dos "Salame" que no se sabe cuál
 * es cuál.
 */
export function abreviarNombres(nombres: string[], largo = 11): Map<string, string> {
  // Los candidatos van de más corto a más largo. Cada producto se queda con el
  // primero que no comparta con ningún otro.
  const candidatos = (nombre: string): string[] => {
    const partes = palabras(nombre);
    const opciones = [recortar(partes[0], largo)];
    if (partes.length > 1) {
      const ultima = partes[partes.length - 1];
      opciones.push(`${recortar(partes[0], 7)} ${recortar(ultima, 7)}`);
    }
    if (partes.length > 2) opciones.push(partes.join(" "));
    return [...new Set([...opciones, nombre.trim()])];
  };

  const opcionesPorNombre = new Map(nombres.map((nombre) => [nombre, candidatos(nombre)]));
  const elegidas = new Map<string, string>();
  let pendientes = [...nombres];

  for (let nivel = 0; pendientes.length > 0; nivel++) {
    const enEsteNivel = new Map<string, string[]>();
    for (const nombre of pendientes) {
      const opciones = opcionesPorNombre.get(nombre) ?? [];
      // Al que se le acabaron los candidatos se queda con el nombre entero:
      // es único por definición (el catálogo no admite nombres repetidos).
      const candidato = opciones[Math.min(nivel, opciones.length - 1)];
      enEsteNivel.set(candidato, [...(enEsteNivel.get(candidato) ?? []), nombre]);
    }

    const siguientes: string[] = [];
    for (const [candidato, conEseNombre] of enEsteNivel) {
      const chocaConOtro =
        conEseNombre.length > 1 || [...elegidas.values()].includes(candidato);
      const sinMasOpciones = conEseNombre.every(
        (nombre) => nivel >= (opcionesPorNombre.get(nombre)?.length ?? 1) - 1
      );
      if (!chocaConOtro || sinMasOpciones) {
        // Si chocan y ya nadie tiene nada mejor, se los deja con el nombre
        // completo antes que con un encabezado ambiguo.
        for (const nombre of conEseNombre) {
          elegidas.set(nombre, chocaConOtro ? nombre.trim() : candidato);
        }
      } else {
        siguientes.push(...conEseNombre);
      }
    }
    pendientes = siguientes;
  }

  return elegidas;
}
