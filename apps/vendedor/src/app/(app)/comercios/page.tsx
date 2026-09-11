"use client";

import { useMemo, useState } from "react";
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
  const { comercios, productos, cargando, comercioRecienEscaneado, elegirComercio, recargar } =
    useDatosLocales();

  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<{ id: string; conPedido: boolean } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  // Si se llegó desde el escáner, ese comercio manda hasta que se elija otra
  // cosa. Se deriva en el render en vez de copiarlo a estado con un efecto.
  const elegido =
    seleccion ?? (comercioRecienEscaneado ? { id: comercioRecienEscaneado, conPedido: true } : null);
  const comercio = comercios.find((c) => c.id === elegido?.id) ?? null;
  const cargandoPedido = elegido?.conPedido ?? false;

  function volverAlListado() {
    setSeleccion(null);
    elegirComercio(null);
  }

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return comercios;
    return comercios.filter(
      (c) =>
        c.codigo.toLowerCase().includes(texto) ||
        c.nombre.toLowerCase().includes(texto) ||
        c.localidad.toLowerCase().includes(texto)
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
          ← Comercios
        </button>

        <div>
          <h1 className="text-lg font-semibold text-stone-900">{comercio.nombre}</h1>
          <p className="text-sm text-stone-500">
            {comercio.codigo} · {comercio.localidad}
          </p>
        </div>

        {cargandoPedido ? (
          <FormularioPedido
            productos={productos}
            textoBoton="Confirmar pedido"
            destino=""
            onGuardar={guardarPedido}
          />
        ) : (
          <div className={`${estilos.tarjeta} space-y-3 p-4`}>
            <button
              type="button"
              onClick={() => setSeleccion({ id: comercio.id, conPedido: true })}
              className={`w-full ${estilos.boton}`}
            >
              Cargar pedido
            </button>
            <button
              type="button"
              onClick={() => void registrarSoloVisita()}
              className={`w-full ${estilos.botonSecundario}`}
            >
              Registrar visita sin pedido
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <h1 className="text-lg font-semibold text-stone-900">Comercios</h1>

      {aviso ? <Mensaje tipo={aviso.tipo}>{aviso.texto}</Mensaje> : null}

      <input
        value={busqueda}
        onChange={(evento) => setBusqueda(evento.target.value)}
        placeholder="Buscar código, nombre o localidad"
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
                setSeleccion({ id: c.id, conPedido: false });
              }}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-stone-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-stone-900">{c.nombre}</p>
                <p className="text-sm text-stone-500">
                  {c.codigo} · {c.localidad}
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
