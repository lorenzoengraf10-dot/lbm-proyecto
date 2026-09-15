import Link from "next/link";
import { ordenarPorCodigo } from "@lbm/shared";
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
    .select("id, codigo, nombre, localidad, direccion, zona, lat, activo")
    .order("codigo");

  // La cartera son unos cientos de comercios: filtrar en memoria evita armar
  // filtros de PostgREST con texto que escribe el usuario.
  const visibles = ordenarPorCodigo(comercios ?? []).filter((comercio) =>
    busqueda
      ? comercio.codigo.toLowerCase().includes(busqueda) ||
        comercio.nombre.toLowerCase().includes(busqueda) ||
        comercio.localidad.toLowerCase().includes(busqueda) ||
        (comercio.direccion ?? "").toLowerCase().includes(busqueda) ||
        (comercio.zona ?? "").toLowerCase().includes(busqueda)
      : true
  );

  // Las que ya están cargadas, para elegirlas de la lista al dar de alta y no
  // terminar con "centro" y "Centro" como si fueran dos zonas distintas.
  const zonas = [...new Set((comercios ?? []).map((c) => c.zona).filter((z): z is string => !!z))].sort(
    (a, b) => a.localeCompare(b, "es")
  );
  const sinUbicacion = (comercios ?? []).filter((c) => c.activo && c.lat === null).length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-stone-900">Comercios</h1>
        <div className="flex gap-2">
          <Link href="/planilla" className={estilos.botonSecundario}>
            Planilla para armar
          </Link>
          <Link href="/comercios/imprimir-qr" className={estilos.botonSecundario}>
            QR para imprimir
          </Link>
          <Link href="/comercios/importar" className={estilos.botonSecundario}>
            Importar desde CSV
          </Link>
        </div>
      </div>

      <Desplegable titulo="Agregar un comercio">
        <FormularioComercio
          accion={crearComercio}
          textoBoton="Crear comercio"
          limpiarAlGuardar
          zonas={zonas}
        />
      </Desplegable>

      {/* La ubicación la va tomando el repartidor con el GPS al pasar, así que
          al principio faltan casi todas. Decir cuántas faltan es lo que hace
          que el mapa deje de estar vacío sin que nadie entienda por qué. */}
      {sinUbicacion > 0 ? (
        <p className="text-sm text-stone-500">
          {sinUbicacion} {sinUbicacion === 1 ? "comercio activo todavía no tiene" : "comercios activos todavía no tienen"}{" "}
          ubicación en el mapa. Se carga sola cuando el repartidor toca “Guardar ubicación” al pasar.{" "}
          <Link href="/mapa" className="underline hover:text-stone-900">
            Ver el mapa
          </Link>
        </p>
      ) : null}

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por código, nombre, dirección o zona"
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
            {
              encabezado: "Dirección",
              celda: (comercio) => comercio.direccion ?? <span className="text-stone-400">—</span>,
            },
            {
              encabezado: "Zona",
              soloEscritorio: true,
              celda: (comercio) => comercio.zona ?? <span className="text-stone-400">—</span>,
            },
            {
              encabezado: "En el mapa",
              soloEscritorio: true,
              celda: (comercio) =>
                comercio.lat !== null ? "Sí" : <span className="text-stone-400">Falta</span>,
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
