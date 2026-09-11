// Arma supabase/esquema-completo.sql pegando todas las migraciones en orden.
//
// Ese archivo es el que se copia en el SQL Editor de Supabase para levantar un
// proyecto nuevo sin usar la terminal. Estaba escrito a mano y se había
// quedado cuatro migraciones atrás: pegarlo habría dejado la base sin la vista
// de cobertura ni las funciones de pedidos. Generarlo evita que vuelva a pasar.
//
//   node scripts/armar-esquema.mjs            escribe el archivo
//   node scripts/armar-esquema.mjs --revisar  falla si quedó desactualizado

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const carpetaMigraciones = join(raiz, "supabase", "migrations");
const destino = join(raiz, "supabase", "esquema-completo.sql");

const encabezado = `-- ============================================================
-- La Buena Medida — esquema completo de la base
--
-- Pegar TODO este archivo en el SQL Editor de Supabase y ejecutar.
-- Es el mismo contenido de supabase/migrations/, junto en un solo
-- archivo para poder aplicarlo sin usar la terminal.
--
-- Se corre UNA sola vez, sobre un proyecto nuevo y vacío.
--
-- GENERADO por scripts/armar-esquema.mjs — no editarlo a mano:
-- los cambios van en supabase/migrations/ y después se regenera con
-- "pnpm esquema".
-- ============================================================
`;

const migraciones = readdirSync(carpetaMigraciones)
  .filter((archivo) => archivo.endsWith(".sql"))
  .sort();

const cuerpo = migraciones
  .map((archivo) => {
    const sql = readFileSync(join(carpetaMigraciones, archivo), "utf8").trimEnd();
    return [
      "",
      "-- ------------------------------------------------------------",
      `-- ${archivo}`,
      "-- ------------------------------------------------------------",
      "",
      sql,
      "",
    ].join("\n");
  })
  .join("\n");

const contenido = `${encabezado}${cuerpo}`;

if (process.argv.includes("--revisar")) {
  const actual = readFileSync(destino, "utf8");
  if (actual !== contenido) {
    console.error(
      "supabase/esquema-completo.sql quedó desactualizado respecto de supabase/migrations/.\n" +
        'Regeneralo con "pnpm esquema".'
    );
    process.exit(1);
  }
  console.log(`esquema-completo.sql al día (${migraciones.length} migraciones).`);
} else {
  writeFileSync(destino, contenido);
  console.log(`esquema-completo.sql generado con ${migraciones.length} migraciones.`);
}
