"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { diasDesde, formatearPrecio } from "@lbm/shared";
import { BotonUbicacion } from "@/components/boton-ubicacion";
import { FormularioPedido, type ItemPedido } from "@/components/formulario-pedido";
import { useDatosLocales } from "@/components/datos-locales";
import { EstadoVacio, Mensaje, estilos } from "@/components/ui";
import { registrarPendiente } from "@/lib/sincronizacion";

/**
 * Lista, ficha y carga de pedido en una sola pantalla de cliente: así todo el
 * circuito del vendedor funciona sin señal, leyendo el catálogo de IndexedDB.
 * Si fueran rutas separadas del servidor, cada paso necesitaría red.
 */
export default function PaginaComercios() {
  const {
    comercios,
    productos,
    ultimosPedidos,
    deudas,
    cargando,
    comercioRecienEscaneado,
    elegirComercio,
    recargar,
    hayConexion,
  } = useDatosLocales();

  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  // Por qué se está cargando sin escanear el QR. null = todavía no se pidió la
  // excepción; con texto, ya se explicó y el pedido se puede cargar marcado.
  const [motivoSinQr, setMotivoSinQr] = useState<string | null>(null);
  const [escribiendoMotivo, setEscribiendoMotivo] = useState(false);
  const [borradorMotivo, setBorradorMotivo] = useState("");

  // Si se llegó desde el escáner, ese comercio manda hasta que se elija otra
  // cosa. Se deriva en el render en vez de copiarlo a estado con un efecto.
  const elegido = seleccion ?? comercioRecienEscaneado;
  const comercio = comercios.find((c) => c.id === elegido) ?? null;

  // El QR es la única prueba de que el repartidor estuvo parado en la puerta.
  // Elegido de la lista no lo es, y ahí hace falta explicar por qué.
  const porQr = seleccion === null && comercioRecienEscaneado !== null;
  const puedeCargar = porQr || motivoSinQr !== null;

  function volverAlListado() {
    setSeleccion(null);
    elegirComercio(null);
    setMotivoSinQr(null);
    setEscribiendoMotivo(false);
    setBorradorMotivo("");
  }

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return comercios;
    return comercios.filter(
      (c) =>
        c.codigo.toLowerCase().includes(texto) ||
        c.nombre.toLowerCase().includes(texto) ||
        c.localidad.toLowerCase().includes(texto) ||
        (c.direccion ?? "").toLowerCase().includes(texto) ||
        (c.zona ?? "").toLowerCase().includes(texto)
    );
  }, [comercios, busqueda]);

  async function guardarPedido(items: ItemPedido[]): Promise<{ error: string | null }> {
    if (!comercio) return { error: "Elegí un comercio." };

    const resultado = await registrarPendiente({
      visitaId: crypto.randomUUID(),
      comercioId: comercio.id,
      comercioNombre: comercio.nombre,
      fechaHora: new Date().toISOString(),
      pedidoId: crypto.randomUUID(),
      items: items.map((item) => ({ producto_id: item.productoId, cantidad: item.cantidad })),
      sinQrMotivo: motivoSinQr,
    });

    // Si el servidor lo rechazó, el vendedor se tiene que enterar ahora, con
    // el comercio todavía enfrente: queda en la cola y no se pierde, pero
    // decirle "Pedido cargado" sería mentirle.
    //
    // Sin recargar a propósito: si el rechazo fue porque dieron de baja el
    // comercio, refrescar el catálogo lo saca de la lista, esta pantalla se
    // desmonta y el motivo se pierde justo cuando hace falta leerlo.
    if (resultado.estado === "rechazado") {
      return { error: `No se pudo cargar: ${resultado.motivo}` };
    }

    await recargar();
    volverAlListado();
    setAviso({
      tipo: "ok",
      texto:
        resultado.estado === "subido"
          ? "Pedido cargado."
          : "Pedido guardado en el celular. Se sube solo cuando vuelva la señal.",
    });
    return { error: null };
  }

  async function registrarSoloVisita() {
    if (!comercio) return;
    const resultado = await registrarPendiente({
      visitaId: crypto.randomUUID(),
      comercioId: comercio.id,
      comercioNombre: comercio.nombre,
      fechaHora: new Date().toISOString(),
      pedidoId: null,
      items: [],
      sinQrMotivo: motivoSinQr,
    });
    await recargar();
    volverAlListado();
    if (resultado.estado === "rechazado") {
      setAviso({ tipo: "error", texto: `No se pudo registrar la visita: ${resultado.motivo}` });
      return;
    }
    setAviso({
      tipo: "ok",
      texto:
        resultado.estado === "subido"
          ? "Visita registrada, sin pedido."
          : "Visita guardada en el celular. Se sube sola cuando vuelva la señal.",
    });
  }

  if (cargando) {
    return <p className="text-sm text-stone-500">Cargando…</p>;
  }

  if (comercio) {
    return (
      <>
        <button
          type="button"
          onClick={volverAlListado}
          className="text-sm text-stone-500 underline"
        >
          ← Cambiar de comercio
        </button>

        <div>
          <h1 className="text-lg font-semibold text-stone-900">{comercio.nombre}</h1>
          <p className="text-sm text-stone-500">
            {comercio.codigo} · {comercio.localidad}
            {comercio.zona ? ` · ${comercio.zona}` : ""}
          </p>
          {comercio.direccion ? (
            <p className="text-sm text-stone-700">{comercio.direccion}</p>
          ) : null}
        </div>

        {/* Lo que este comercio quedó debiendo, arriba de todo y antes de
            cargarle nada. Es el único momento en que sirve: el repartidor está
            en la puerta y puede cobrar. Baja con el catálogo, así que se ve
            igual sin señal. */}
        <Deuda deuda={deudas[comercio.id]} />

        <BotonUbicacion
          // key por comercio: el aviso de "Ubicación guardada" es del comercio
          // que se acaba de tocar, no del siguiente.
          key={comercio.id}
          comercioId={comercio.id}
          // typeof y no "!== null": el catálogo guardado en el celular por una
          // versión anterior de la app no tiene el campo, así que llega
          // undefined — y undefined !== null es true, con lo que el botón le
          // decía "ya está en el mapa" a comercios que no lo estaban.
          yaTiene={typeof comercio.lat === "number"}
          hayConexion={hayConexion}
          alGuardar={() => void recargar()}
        />

        {/* El candado del QR. Escaneado, se carga y listo. Elegido de la
            lista, primero hay que decir por qué no se escaneó: el QR es la
            única prueba de que el repartidor estuvo en la puerta, y sin eso
            "visitado" no quiere decir nada. La salida existe igual porque un
            cartel despegado no puede costar una venta. */}
        {!puedeCargar ? (
          <div className={`${estilos.tarjeta} space-y-3 p-4`}>
            <p className="text-sm text-stone-700">
              Para cargarle el pedido hay que <strong>escanear el QR</strong> del comercio.
            </p>
            <Link href="/escanear" className={`block text-center ${estilos.boton}`}>
              Escanear el QR
            </Link>

            {escribiendoMotivo ? (
              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className={estilos.etiqueta}>¿Por qué no se puede escanear?</span>
                  <textarea
                    value={borradorMotivo}
                    onChange={(e) => setBorradorMotivo(e.target.value)}
                    rows={2}
                    maxLength={200}
                    placeholder="Ej.: se despegó el cartel, está tapado por la heladera…"
                    className={estilos.input}
                  />
                </label>
                <button
                  type="button"
                  disabled={borradorMotivo.trim().length < 3}
                  onClick={() => setMotivoSinQr(borradorMotivo.trim())}
                  className={`w-full ${estilos.botonSecundario}`}
                >
                  Seguir sin QR
                </button>
                <p className="text-xs text-stone-400">
                  El pedido va a quedar marcado como cargado sin QR, con este motivo.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEscribiendoMotivo(true)}
                className="block w-full text-sm text-stone-500 underline"
              >
                No se puede escanear el QR
              </button>
            )}
          </div>
        ) : (
          <>
            {motivoSinQr !== null ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Este pedido se va a cargar <strong>sin QR</strong>: “{motivoSinQr}”. Va a quedar
                marcado así en el panel.
              </p>
            ) : null}

            {/* Pasar sin pedido es la excepción, no una opción al mismo nivel: va al
                pie del formulario, que además es el único que sabe si hay
                cantidades cargadas que se perderían. */}
            <FormularioPedido
              productos={productos}
              ultimoPedido={ultimosPedidos[comercio.id]}
              textoBoton="Confirmar pedido"
              destino=""
              onGuardar={guardarPedido}
              onSinPedido={() => void registrarSoloVisita()}
            />
          </>
        )}
      </>
    );
  }

  return (
    <>
      <div>
        <h1 className="text-lg font-semibold text-stone-900">Pedido nuevo</h1>
        <p className="text-sm text-stone-500">¿A qué comercio?</p>
      </div>

      {aviso ? <Mensaje tipo={aviso.tipo}>{aviso.texto}</Mensaje> : null}

      <input
        value={busqueda}
        onChange={(evento) => setBusqueda(evento.target.value)}
        placeholder="Buscar código, nombre, dirección o zona"
        className={estilos.input}
      />

      <div className={`${estilos.tarjeta} divide-y divide-stone-100 overflow-hidden`}>
        {visibles.length === 0 ? (
          <EstadoVacio>
            {comercios.length === 0
              ? "Todavía no se descargó la cartera. Abrí la app una vez con señal."
              : "Ningún comercio coincide con la búsqueda."}
          </EstadoVacio>
        ) : (
          visibles.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setAviso(null);
                // Directo a los productos: elegir el comercio ya es decir que
                // se le va a cargar un pedido. Antes había una pantalla en el
                // medio que preguntaba qué hacer, y era un toque de más en lo
                // único que el repartidor hace todo el día.
                setSeleccion(c.id);
              }}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-stone-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-stone-900">{c.nombre}</p>
                <p className="truncate text-sm text-stone-500">
                  {c.codigo}
                  {c.direccion ? ` · ${c.direccion}` : ` · ${c.localidad}`}
                </p>
              </div>
              <span aria-hidden className="text-stone-400">
                ›
              </span>
            </button>
          ))
        )}
      </div>
    </>
  );
}

/**
 * "Este te debe $X".
 *
 * En rojo y arriba del pedido a propósito: es una decisión que el repartidor
 * toma antes de cargar nada —si le sigue fiando o le cobra primero— y si
 * estuviera abajo la vería cuando ya no le sirve.
 */
function Deuda({ deuda }: { deuda: { pesos: number; pedidos: number; desde: string } | undefined }) {
  if (!deuda || deuda.pesos <= 0) return null;

  const dias = diasDesde(deuda.desde);
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
      <p className="text-sm font-medium text-red-900">
        Debe {formatearPrecio(deuda.pesos)}
      </p>
      <p className="text-xs text-red-800">
        {deuda.pedidos === 1 ? "1 pedido" : `${deuda.pedidos} pedidos`} a cuenta sin cobrar
        {dias >= 1 ? `, el más viejo de hace ${dias === 1 ? "1 día" : `${dias} días`}` : ""}.
      </p>
    </div>
  );
}
