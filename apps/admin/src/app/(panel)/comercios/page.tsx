import Link from "next/link";
import { Desplegable } from "@/components/desplegable";
import { Tabla } from "@/components/tabla";
import { EstadoVacio, Etiqueta, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { crearComercio } from "./actions";
import { FormularioComercio } from "./formulario";

export default async function PaginaComercios({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { q } = await searchParams;
  const busqueda = (q ?? "").trim().toLowerCase();

  const { data: comercios, error } = await supabase
    .from("comercios")
    .select("id, codigo, nombre, localidad, telefono, activo")
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-stone-900">Comercios</h1>
        <div className="flex gap-2">
          <Link href="/comercios/imprimir-qr" className={estilos.botonSecundario}>
            QR para imprimir
          </Link>
          <Link href="/comercios/importar" className={estilos.botonSecundario}>
            Importar desde CSV
          </Link>
        </div>
      </div>

      <Desplegable titulo="Agregar un comercio">
        <FormularioComercio accion={crearComercio} textoBoton="Crear comercio" limpiarAlGuardar />
      </Desplegable>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por código, nombre o localidad"
          maxLength={100}
          className={estilos.input}
        />
        <button type="submit" className={estilos.botonSecundario}>
          Buscar
        </button>
      </form>

      {error ? (
        <div className={`${estilos.tarjeta} overflow-hidden`}>
          <EstadoVacio>No se pudieron cargar los comercios: {error.message}</EstadoVacio>
        </div>
      ) : (
        <Tabla
          filas={visibles}
          clave={(comercio) => comercio.id}
          vacio={
            busqueda
              ? "Ningún comercio coincide con la búsqueda."
              : "Todavía no hay comercios cargados."
          }
          columnas={[
            {
              encabezado: "Comercio",
              principal: true,
              celda: (comercio) => (
                <Link href={`/comercios/${comercio.id}`} className="hover:underline">
                  {comercio.codigo} · {comercio.nombre}
                </Link>
              ),
            },
            { encabezado: "Localidad", celda: (comercio) => comercio.localidad },
            {
              encabezado: "Teléfono",
              soloEscritorio: true,
              celda: (comercio) => comercio.telefono ?? "—",
            },
            { encabezado: "Estado", celda: (comercio) => <Etiqueta activo={comercio.activo} /> },
            {
              encabezado: "Acciones",
              soloEscritorio: true,
              celda: (comercio) => (
                <Link
                  href={`/comercios/${comercio.id}`}
                  className="text-stone-600 underline hover:text-stone-900"
                >
                  Editar
                </Link>
              ),
            },
          ]}
        />
      )}

      <p className="text-sm text-stone-500">
        {visibles.length} de {comercios?.length ?? 0} comercios
        {" · "}
        {(comercios ?? []).filter((c) => c.activo).length} activos
      </p>
    </>
  );
}
