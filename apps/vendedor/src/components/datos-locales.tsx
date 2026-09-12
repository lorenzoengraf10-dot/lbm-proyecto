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
  leerProductos,
  leerUltimosPedidos,
  type ComercioLocal,
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
  cargando: boolean;
  hayConexion: boolean;
  /** Comercio elegido al escanear, para que /comercios lo abra al llegar. */
  comercioRecienEscaneado: string | null;
  elegirComercio: (id: string | null) => void;
  recargar: () => Promise<void>;
}

const Contexto = createContext<DatosLocales | null>(null);

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
  const [cargando, setCargando] = useState(true);
  const [comercioRecienEscaneado, setComercioRecienEscaneado] = useState<string | null>(null);

  // navigator.onLine es un sistema externo con sus propios eventos: esto es
  // justo para lo que existe useSyncExternalStore (y evita copiarlo a estado
  // dentro de un efecto).
  const hayConexion = useSyncExternalStore(
    suscribirseAConexion,
    () => navigator.onLine,
    () => true
  );

  const leerDeLocal = useCallback(async () => {
    const [comerciosLocales, productosLocales, colaLocal, ultimos] = await Promise.all([
      leerComercios(),
      leerProductos(),
      leerCola(),
      leerUltimosPedidos(),
    ]);
    setComercios(comerciosLocales);
    setProductos(productosLocales);
    setCola(colaLocal);
    setUltimosPedidos(ultimos);
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
    const alVolverLaSenal = () => void recargar();
    window.addEventListener("online", alVolverLaSenal);
    return () => window.removeEventListener("online", alVolverLaSenal);
  }, [recargar]);

  const valor = useMemo(
    () => ({
      comercios,
      productos,
      cola,
      ultimosPedidos,
      cargando,
      hayConexion,
      comercioRecienEscaneado,
      elegirComercio: setComercioRecienEscaneado,
      recargar,
    }),
    [comercios, productos, cola, ultimosPedidos, cargando, hayConexion, comercioRecienEscaneado, recargar]
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
