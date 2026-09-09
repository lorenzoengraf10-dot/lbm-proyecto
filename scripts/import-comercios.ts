// Importación masiva inicial de comercios desde un CSV con columnas:
// codigo,nombre,localidad
//
// Uso:
//   pnpm --filter @lbm/scripts run import:comercios -- comercios.csv --dry-run
//   pnpm --filter @lbm/scripts run import:comercios -- comercios.csv
//
// Es seguro correrlo más de una vez: hace upsert por codigo (no duplica).

import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import type { ComercioImportRow } from "@lbm/shared";
import { crearClienteAdmin } from "./supabaseAdmin.js";

interface FilaCsv {
  codigo?: string;
  nombre?: string;
  localidad?: string;
}

function parsearArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const archivo = argv.find((a) => !a.startsWith("--"));
  return { dryRun, archivo };
}

function normalizarFilas(filasCrudas: FilaCsv[]): { validas: ComercioImportRow[]; errores: string[] } {
  const validas: ComercioImportRow[] = [];
  const errores: string[] = [];

  filasCrudas.forEach((fila, indice) => {
    const numeroFila = indice + 2; // +1 por el header, +1 porque el índice arranca en 0
    const codigo = fila.codigo?.trim().toUpperCase();
    const nombre = fila.nombre?.trim();
    const localidad = fila.localidad?.trim();

    if (!codigo || !nombre || !localidad) {
      errores.push(`Fila ${numeroFila}: faltan datos (codigo/nombre/localidad) — ${JSON.stringify(fila)}`);
      return;
    }

    validas.push({ codigo, nombre, localidad });
  });

  return { validas, errores };
}

async function main() {
  const { dryRun, archivo } = parsearArgs(process.argv.slice(2));

  if (!archivo) {
    console.error("Uso: import-comercios.ts <archivo.csv> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const contenido = readFileSync(archivo, "utf-8");
  const filasCrudas: FilaCsv[] = parse(contenido, {
    columns: (headers: string[]) => headers.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
  });

  const { validas, errores } = normalizarFilas(filasCrudas);

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
