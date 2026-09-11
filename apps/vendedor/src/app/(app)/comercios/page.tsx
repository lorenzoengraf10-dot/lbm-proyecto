import Link from "next/link";
import { EstadoVacio, estilos } from "@/components/ui";
import { requerirVendedor } from "@/lib/auth";

export default async function PaginaComercios({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { supabase } = await requerirVendedor();
  const { q } = await searchParams;
  const busqueda = (q ?? "").trim().toLowerCase();

  const { data: comercios, error } = await supabase
    .from("comercios")
    .select("id, codigo, nombre, localidad")
    .order("codigo");

  // La cartera son unos cientos de comercios: filtrar en memoria evita armar
  // filtros de PostgREST con texto que escribe el usuario.
  const visibles = (comercios ?? []).filter((comercio) =>
    busqueda
      ? comercio.codigo.toLowerCase().includes(busqueda) ||
        comercio.nombre.toLowerCase().includes(busqueda) ||
        comercio.localidad.toLowerCase().includes(busqueda)
      : true
  );

  return (
    <>
      <h1 className="text-lg font-semibold text-stone-900">Comercios</h1>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar código, nombre o localidad"
          className={estilos.input}
        />
        <button type="submit" className={`${estilos.botonSecundario} shrink-0`}>
          Buscar
        </button>
      </form>

      <div className={`${estilos.tarjeta} divide-y divide-stone-100 overflow-hidden`}>
        {error ? (
          <EstadoVacio>No se pudo cargar la cartera: {error.message}</EstadoVacio>
        ) : visibles.length === 0 ? (
          <EstadoVacio>
            {busqueda ? "Ningún comercio coincide con la búsqueda." : "Todavía no hay comercios."}
          </EstadoVacio>
        ) : (
          visibles.map((comercio) => (
            <Link
              key={comercio.id}
              href={`/comercios/${comercio.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 active:bg-stone-50"
            >
              <div>
                <p className="font-medium text-stone-900">{comercio.nombre}</p>
                <p className="text-sm text-stone-500">
                  {comercio.codigo} · {comercio.localidad}
                </p>
              </div>
              <span aria-hidden className="text-stone-400">
                ›
              </span>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
