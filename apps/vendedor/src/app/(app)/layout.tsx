"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CandadoPin } from "@/components/candado-pin";
import { ProveedorDatosLocales } from "@/components/datos-locales";
import { BarraInferior, EncabezadoSuperior } from "@/components/nav";
import { leerPerfil } from "@/lib/almacen-local";
import { crearClienteNavegador } from "@/lib/supabase-browser";

/**
 * Cliente y no servidor, a propósito: con el layout renderizado en el
 * servidor, abrir la app sin señal sería un error de red antes de llegar a
 * ninguna pantalla. Así el shell se sirve desde el service worker y los datos
 * salen de IndexedDB.
 *
 * El control de acceso de verdad no vive acá: lo hacen las RLS de la base
 * (un vendedor solo puede leer y escribir lo suyo) y proxy.ts cuando hay
 * conexión. Este chequeo es para no mostrar la app a una sesión vencida.
 */
export default function LayoutApp({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");

  useEffect(() => {
    void (async () => {
      setNombre(await leerPerfil());

      // getSession lee la cookie local, así que no falla sin señal. Solo se
      // echa a alguien cuando se confirma que no hay sesión guardada.
      const {
        data: { session },
      } = await crearClienteNavegador().auth.getSession();
      if (!session) router.replace("/login");
    })();
  }, [router]);

  return (
    <ProveedorDatosLocales>
      <CandadoPin>
        <EncabezadoSuperior nombre={nombre} />
        <main className="mx-auto w-full max-w-lg flex-1 space-y-4 p-4 pb-20">{children}</main>
        <BarraInferior />
      </CandadoPin>
    </ProveedorDatosLocales>
  );
}
