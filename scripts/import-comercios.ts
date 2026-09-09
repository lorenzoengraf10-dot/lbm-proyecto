// Importación masiva inicial de comercios desde un CSV con columnas:
// codigo,nombre,localidad
//
// Uso:
//   pnpm --filter @lbm/scripts run import:comercios -- comercios.csv --dry-run
//   pnpm --filter @lbm/scripts run import:comercios -- comercios.csv
//
// Es seguro correrlo más de una vez: hace upsert por codigo (no duplica).
// La misma validación la usa la pantalla de importación del panel admin.

import { readFileSync } from "node:fs";
import { parsearCsvComercios } from "@lbm/shared";
import { crearClienteAdmin } from "./supabaseAdmin";

function parsearArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const archivo = argv.find((a) => !a.startsWith("--"));
  return { dryRun, archivo };
}

async function main() {
  const { dryRun, archivo } = parsearArgs(process.argv.slice(2));

  if (!archivo) {
    console.error("Uso: import-comercios.ts <archivo.csv> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const { validas, errores } = parsearCsvComercios(readFileSync(archivo, "utf-8"));

  if (errores.length > 0) {
    console.error(`${errores.length} fila(s) con problemas:`);
    errores.forEach((e) => console.error(`  - ${e}`));
  }

  console.log(`${validas.length} comercio(s) válido(s) para importar.`);

  if (dryRun) {
    console.table(validas);
    console.log("Dry-run: no se escribió nada en la base.");
    return;
  }

  if (validas.length === 0) {
    console.log("Nada para importar.");
    return;
  }

  const supabase = crearClienteAdmin();
  const { error } = await supabase.from("comercios").upsert(validas, { onConflict: "codigo" });

  if (error) {
    console.error("Error al importar:", error.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Importación completa: ${validas.length} comercio(s) insertado(s)/actualizado(s).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
