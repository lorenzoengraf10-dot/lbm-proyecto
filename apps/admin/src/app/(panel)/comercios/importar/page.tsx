import Link from "next/link";
import { ImportadorCsv } from "./importador";

export default function PaginaImportar() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/comercios" className="text-sm text-stone-500 underline hover:text-stone-900">
          ← Comercios
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">Importar comercios</h1>
      </div>

      <ImportadorCsv />
    </>
  );
}
