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

/** Se comparan sin distinguir mayúsculas, igual que el índice único de la base. */
const clave = (texto: string) => texto.trim().toLowerCase();

/**
 * Nombres cortos para la planilla del día. Con quince productos, un título
 * como "Bondiola ahumada casera" hace una celda de cuatro centímetros y la
 * hoja deja de entrar en un A4.
 *
 * Se acorta lo mínimo necesario: primero la primera palabra sola, y solo si
 * dos productos quedarían con el mismo nombre se agrega lo que los distingue.
 * Mejor "Salame fino" y "Salame grueso" que dos "Salame" que no se sabe cuál
 * es cuál.
 *
 * `reservadas` son las abreviaturas que el dueño cargó a mano para otros
 * productos. Sin pasarlas, la automática de uno podía salir igual que la
 * escrita a mano de otro —la base no lo ve, porque la automática no está
 * guardada— y la planilla impresa quedaba con dos renglones que decían lo
 * mismo.
 */
export function abreviarNombres(
  nombres: string[],
  { reservadas = [], largo = 11 }: { reservadas?: string[]; largo?: number } = {}
): Map<string, string> {
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
  const tomadas = new Set(reservadas.map(clave));
  let pendientes = [...nombres];

  for (let nivel = 0; pendientes.length > 0; nivel++) {
    const enEsteNivel = new Map<string, string[]>();
    for (const nombre of pendientes) {
      const opciones = opcionesPorNombre.get(nombre) ?? [];
      // Al que se le acabaron los candidatos se queda con el nombre entero:
      // es único por definición (el catálogo no admite nombres repetidos, ni
      // una abreviatura igual al nombre de otro producto).
      const candidato = opciones[Math.min(nivel, opciones.length - 1)];
      enEsteNivel.set(candidato, [...(enEsteNivel.get(candidato) ?? []), nombre]);
    }

    const siguientes: string[] = [];
    for (const [candidato, conEseNombre] of enEsteNivel) {
      const chocaConOtro = conEseNombre.length > 1 || tomadas.has(clave(candidato));
      const sinMasOpciones = conEseNombre.every(
        (nombre) => nivel >= (opcionesPorNombre.get(nombre)?.length ?? 1) - 1
      );
      if (!chocaConOtro || sinMasOpciones) {
        // Si chocan y ya nadie tiene nada mejor, se los deja con el nombre
        // completo antes que con un encabezado ambiguo.
        for (const nombre of conEseNombre) {
          const elegida = chocaConOtro ? nombre.trim() : candidato;
          elegidas.set(nombre, elegida);
          tomadas.add(clave(elegida));
        }
      } else {
        siguientes.push(...conEseNombre);
      }
    }
    pendientes = siguientes;
  }

  return elegidas;
}
