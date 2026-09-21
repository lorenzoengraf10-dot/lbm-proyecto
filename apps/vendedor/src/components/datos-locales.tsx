"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  leerComercios,
  leerCola,
  leerDeudas,
  leerProductos,
  leerUltimosPedidos,
  type ComercioLocal,
  type DeudaLocal,
  type ItemUltimoPedido,
  type PendienteCola,
  type ProductoLocal,
} from "@/lib/almacen-local";
import { refrescarCatalogo, sincronizar } from "@/lib/sincronizacion";

interface DatosLocales {
  comercios: ComercioLocal[];
  productos: ProductoLocal[];
  cola: PendienteCola[];
  /** Lo último que pidió cada comercio, por id, para poder repetirlo. */
  ultimosPedidos: Record<string, ItemUltimoPedido[]>;
  /** Lo que quedó debiendo cada comercio, por id. Sin deuda, no está la clave. */
  deudas: Record<string, DeudaLocal>;
  cargando: boolean;
  hayConexion: boolean;
  /** Comercio elegido al escanear, para que /comercios lo abra al llegar. */
  comercioRecienEscaneado: string | null;
  elegirComercio: (id: string | null) => void;
  recargar: () => Promise<void>;
}

const Contexto = createContext<DatosLocales | null>(null);

// El escaneo se guarda en sessionStorage y no solo en memoria: si la pantalla
// se recarga —el service worker que se actualiza, Android que se lleva puesta
// la pestaña, un tirón de más para abajo— el repartidor estaba parado frente al
// comercio con el QR ya escaneado y tenía que volver a escanearlo. Muere con la
// pestaña, así que no sobrevive al día siguiente.
const CLAVE_ESCANEADO = "lbm-comercio-escaneado";

// sessionStorage es un almacén de afuera de React, así que se lee con
// useSyncExternalStore: es lo mismo que ya se hace acá con navigator.onLine, y
// evita el efecto que copia el valor a estado (que en la primera pasada
// renderiza sin el comercio y recién después con él).
const oyentes = new Set<() => void>();

function suscribirseAlEscaneo(alCambiar: () => void) {
  oyentes.add(alCambiar);
  return () => {
    oyentes.delete(alCambiar);
  };
}

function leerEscaneado(): string | null {
  try {
    return sessionStorage.getItem(CLAVE_ESCANEADO);
  } catch {
    // Modo privado o almacenamiento bloqueado.
    return null;
  }
}

// En el servidor no hay sessionStorage y no hay nada escaneado todavía.
function sinEscanearEnElServidor(): null {
  return null;
}

function guardarEscaneado(id: string | null) {
  try {
    if (id === null) sessionStorage.removeItem(CLAVE_ESCANEADO);
    else sessionStorage.setItem(CLAVE_ESCANEADO, id);
  } catch {
    // Si no se pudo guardar, igual hay que avisarle a la pantalla: se pierde al
    // recargar, que es exactamente como andaba antes.
  }
  for (const avisar of oyentes) avisar();
}

// Desde que el pedido solo se carga escaneando, la pantalla del escáner tiene
// que abrir sin señal sí o sí. El service worker guarda lo que se va visitando,
// así que una pantalla que nunca se abrió con señal no está: y para una
// navegación que no tiene guardada devuelve el listado de comercios, que es
// justo la pantalla que dice "escaneá el QR". El repartidor quedaba dando
// vueltas entre las dos. Con esto se guarda apenas abre la app en el local,
// antes de salir.
function precalentarEscaner() {
  if (!navigator.onLine) return;
  void fetch("/escanear", { credentials: "same-origin" }).catch(() => {
    // Si falla no pasa nada: se vuelve a intentar la próxima vez que abra.
  });
}

function suscribirseAConexion(alCambiar: () => void) {
  window.addEventListener("online", alCambiar);
  window.addEventListener("offline", alCambiar);
  return () => {
    window.removeEventListener("online", alCambiar);
    window.removeEventListener("offline", alCambiar);
  };
}

export function useDatosLocales(): DatosLocales {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error("useDatosLocales fuera de ProveedorDatosLocales");
  return contexto;
}

export function ProveedorDatosLocales({ children }: { children: ReactNode }) {
  const [comercios, setComercios] = useState<ComercioLocal[]>([]);
  const [productos, setProductos] = useState<ProductoLocal[]>([]);
  const [cola, setCola] = useState<PendienteCola[]>([]);
  const [ultimosPedidos, setUltimosPedidos] = useState<Record<string, ItemUltimoPedido[]>>({});
  const [deudas, setDeudas] = useState<Record<string, DeudaLocal>>({});
  const [cargando, setCargando] = useState(true);
  const comercioRecienEscaneado = useSyncExternalStore(
    suscribirseAlEscaneo,
    leerEscaneado,
    sinEscanearEnElServidor
  );

  // navigator.onLine es un sistema externo con sus propios eventos: esto es
  // justo para lo que existe useSyncExternalStore (y evita copiarlo a estado
  // dentro de un efecto).
  const hayConexion = useSyncExternalStore(
    suscribirseAConexion,
    () => navigator.onLine,
    () => true
  );

  const leerDeLocal = useCallback(async () => {
    const [comerciosLocales, productosLocales, colaLocal, ultimos, deudasLocales] =
      await Promise.all([
        leerComercios(),
        leerProductos(),
        leerCola(),
        leerUltimosPedidos(),
        leerDeudas(),
      ]);
    setComercios(comerciosLocales);
    setProductos(productosLocales);
    setCola(colaLocal);
    setUltimosPedidos(ultimos);
    setDeudas(deudasLocales);
  }, []);

  const elegirComercio = useCallback((id: string | null) => {
    guardarEscaneado(id);
  }, []);

  const recargar = useCallback(async () => {
    await leerDeLocal();
    await refrescarCatalogo();
    await sincronizar();
    await leerDeLocal();
  }, [leerDeLocal]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      // Primero lo guardado: la app tiene que abrir con datos aunque no haya
      // señal. Después, si hay, se refresca y se vacía la cola.
      await leerDeLocal();
      if (vivo) setCargando(false);
      precalentarEscaner();
      await refrescarCatalogo();
      await sincronizar();
      if (vivo) await leerDeLocal();
    })();
    return () => {
      vivo = false;
    };
  }, [leerDeLocal]);

  // Al recuperar la señal se refresca el catálogo y se vacía la cola sola.
  useEffect(() => {
    const alVolverLaSenal = () => {
      precalentarEscaner();
      void recargar();
    };
    window.addEventListener("online", alVolverLaSenal);
    return () => window.removeEventListener("online", alVolverLaSenal);
  }, [recargar]);

  const valor = useMemo(
    () => ({
      comercios,
      productos,
      cola,
      ultimosPedidos,
      deudas,
      cargando,
      hayConexion,
      comercioRecienEscaneado,
      elegirComercio,
      recargar,
    }),
    [
      comercios,
      productos,
      cola,
      ultimosPedidos,
      deudas,
      cargando,
      hayConexion,
      comercioRecienEscaneado,
      elegirComercio,
      recargar,
    ]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
