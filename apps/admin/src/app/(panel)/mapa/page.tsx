import Link from "next/link";
import {
  diaArgentina,
  etiquetaRango,
  formatearPrecio,
  rangoDesdeParametros,
  sumarDias,
} from "@lbm/shared";
import { Tabla } from "@/components/tabla";
import { EstadoVacio, estilos } from "@/components/ui";
import { requerirAdmin } from "@/lib/auth";
import { COLORES, SIN_ZONA, armarMapa } from "@/lib/mapa";
import { MapaComercios } from "./mapa-comercios";

export default async function PaginaMapa({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; zona?: string }>;
}) {
  const { supabase } = await requerirAdmin();
  const { desde, hasta, zona } = await searchParams;

  const hoy = diaArgentina();
  // Por defecto el último mes y no el día de hoy: esto es para estudiar el
  // mercado, y un solo día no dice nada de cómo viene una zona.
  const rango = rangoDesdeParametros(desde ?? sumarDias(hoy, -29), hasta ?? hoy, hoy);
  const zonaElegida = zona?.trim() || undefined;

  const mapa = await armarMapa(supabase, rango, zonaElegida);
  // Una zona del enlace que no le corresponde a ningún comercio: hay que
  // decirlo, porque si no el mapa sale vacío y parece que se rompió.
  const zonaSinComercios =
    zonaElegida !== undefined && !mapa.zonas.some((z) => z.zona === zonaElegida);

  const conUbicacion = mapa.puntos.length;
  const faltan = mapa.sinUbicacion.length;
  const enlace = (cambios: Record<string, string>) => {
    const partes = new URLSearchParams({
      desde: rango.desde,
      hasta: rango.hasta,
      ...(zonaElegida ? { zona: zonaElegida } : {}),
      ...cambios,
    });
    for (const [clave, valor] of [...partes]) if (!valor) partes.delete(clave);
    return `/mapa?${partes}`;
  };

  return (
    <>
      <h1 className="text-xl font-semibold text-stone-900">Mapa de la cartera</h1>

      <p className="text-sm text-stone-500">
        Cada comercio con un punto, del color de cómo le fue en el período. Los puntos los va
        cargando el repartidor con el GPS del celular al pasar por cada puerta.
      </p>

      <form className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Desde</span>
          <input type="date" name="desde" defaultValue={rango.desde} max={hoy} className={estilos.input} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Hasta</span>
          <input type="date" name="hasta" defaultValue={rango.hasta} max={hoy} className={estilos.input} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className={estilos.etiqueta}>Zona</span>
          <select name="zona" defaultValue={zonaElegida ?? ""} className={estilos.input}>
            <option value="">Todo el pueblo</option>
            {/* Si el enlace trae una zona que ya no existe —se renombró, o
                vino mal escrita— igual se muestra elegida. Si no, el filtro
                se aplicaba igual y el selector decía "Todo el pueblo": el
                mapa quedaba vacío sin forma de entender por qué. */}
            {zonaSinComercios ? <option value={zonaElegida}>{zonaElegida}</option> : null}
            {mapa.zonas.map((z) => (
              <option key={z.zona} value={z.zona}>
                {z.zona}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={estilos.botonSecundario}>
          Ver
        </button>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={enlace({ desde: sumarDias(hoy, -6), hasta: hoy })} className="text-stone-500 underline hover:text-stone-900">
            Última semana
          </Link>
          <Link href={enlace({ desde: sumarDias(hoy, -29), hasta: hoy })} className="text-stone-500 underline hover:text-stone-900">
            Último mes
          </Link>
        </div>
      </form>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-medium text-stone-900">
          {etiquetaRango(rango.desde, rango.hasta)}
        </h2>
        <p className="text-sm text-stone-500">
          {zonaElegida ? `${zonaElegida} · ` : ""}
          {conUbicacion} en el mapa
          {faltan > 0 ? `, ${faltan} sin ubicación todavía` : ""}
        </p>
      </div>

      {/* La referencia va arriba del mapa y no abajo: es lo primero que hay que
          saber para entender lo que se está mirando. */}
      <div className="flex flex-wrap gap-4 text-sm">
        {Object.entries(COLORES).map(([estado, { color, etiqueta }]) => (
          <span key={estado} className="flex items-center gap-2 text-stone-600">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full ring-2 ring-white"
              style={{ backgroundColor: color }}
            />
            {etiqueta}
          </span>
        ))}
      </div>

      {conUbicacion === 0 ? (
        <div className={`${estilos.tarjeta} overflow-hidden`}>
          <EstadoVacio>
            {zonaSinComercios
              ? `Ningún comercio está en la zona “${zonaElegida}”. Elegí otra arriba, o “Todo el pueblo”.`
              : "Todavía no hay ningún comercio ubicado en el mapa. El repartidor los va cargando desde la app: entra al comercio y toca \u201cGuardar ubicación\u201d parado en la puerta."}
          </EstadoVacio>
        </div>
      ) : (
        <MapaComercios puntos={mapa.puntos} centro={mapa.centro} />
      )}

      {/* El estudio de mercado propiamente dicho: el mapa muestra dónde, esta
          tabla muestra cuánto. Se arma sobre todos los comercios, tengan punto
          o no — uno existe aunque nadie le haya tomado la ubicación. */}
      <div className="space-y-2">
        <h2 className="text-base font-medium text-stone-900">Por zona</h2>
        <Tabla
          filas={mapa.zonas}
          clave={(z) => z.zona}
          vacio="Todavía no hay zonas cargadas."
          columnas={[
            {
              encabezado: "Zona",
              principal: true,
              celda: (z) =>
                z.zona === SIN_ZONA ? (
                  <span className="text-stone-500">{z.zona}</span>
                ) : (
                  <Link href={enlace({ zona: z.zona })} className="hover:underline">
                    {z.zona}
                  </Link>
                ),
            },
            { encabezado: "Comercios", celda: (z) => z.comercios },
            {
              encabezado: "Visitados",
              celda: (z) => `${z.visitados} de ${z.comercios}`,
            },
            {
              encabezado: "Pidieron",
              celda: (z) => `${z.pidieron} de ${z.comercios}`,
            },
            { encabezado: "Vendido", celda: (z) => formatearPrecio(z.totalPesos) },
            {
              encabezado: "En el mapa",
              soloEscritorio: true,
              celda: (z) => `${z.enElMapa} de ${z.comercios}`,
            },
          ]}
        />
        {mapa.zonas.some((z) => z.zona === SIN_ZONA) ? (
          <p className="text-sm text-stone-500">
            Los de <strong>Sin zona</strong> todavía no tienen una asignada. Se pone desde la ficha
            de cada comercio, o de una vez en la importación por Excel.
          </p>
        ) : null}
      </div>

      {faltan > 0 ? (
        <div className="space-y-2">
          <h2 className="text-base font-medium text-stone-900">
            Todavía sin ubicación ({faltan})
          </h2>
          <p className="text-sm text-stone-500">
            No se pueden dibujar hasta que alguien pase y toque “Guardar ubicación” en la app.
          </p>
          <div className={`${estilos.tarjeta} divide-y divide-stone-100`}>
            {mapa.sinUbicacion.map((punto) => (
              <div key={punto.id} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm">
                <Link href={`/comercios/${punto.id}`} className="text-stone-700 hover:underline">
                  {punto.codigo} · {punto.nombre}
                </Link>
                <span className="text-stone-400">
                  {punto.direccion ?? "sin dirección"} · {punto.zona}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
