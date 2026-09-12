"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ProveedorDatosLocales } from "@/components/datos-locales";
import { BarraInferior, EncabezadoSuperior } from "@/components/nav";
import { asegurarDuenio, leerPerfil } from "@/lib/almacen-local";
import { refrescarCatalogo } from "@/lib/sincronizacion";
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
      // getSession lee la cookie local, así que no falla sin señal. Solo se
      // echa a alguien cuando se confirma que no hay sesión guardada.
      const {
        data: { session },
      } = await crearClienteNavegador().auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      // Si en este celular venía trabajando otro repartidor, se borra lo suyo
      // antes de mostrar nada: catálogo, nombre y cola de pendientes.
      await asegurarDuenio(session.user.id);

      let propio = await leerPerfil();
      if (!propio) {
        // Primera vez en este celular (o recién se limpió lo del anterior):
        // se baja la cartera y el nombre. Sin señal queda vacío, que es mejor
        // que mostrar el nombre del repartidor de antes.
        await refrescarCatalogo();
        propio = await leerPerfil();
      }
      setNombre(propio);
    })();
  }, [router]);

  return (
    <ProveedorDatosLocales>
      <EncabezadoSuperior nombre={nombre} />
      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 p-4 pb-20">{children}</main>
      <BarraInferior />
    </ProveedorDatosLocales>
  );
}
