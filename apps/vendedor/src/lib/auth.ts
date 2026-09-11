import { cache } from "react";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "./supabase-server";

export interface SesionVendedor {
  userId: string;
  nombre: string;
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>;
}

/**
 * Puerta de entrada para todo lo que hace la app. Hay que llamarla en cada
 * página Y en cada server action: las actions son endpoints HTTP propios, así
 * que el guard del layout no alcanza para protegerlas.
 *
 * Esto es la autenticación real (Supabase Auth + rol). El PIN de
 * CandadoPin es una capa aparte, del lado del navegador, para no repetir la
 * contraseña real a cada rato — nunca reemplaza este chequeo.
 *
 * Va envuelta en cache() de React: el layout y la página la llaman por
 * separado, y sin esto cada request pagaría dos veces la validación del token
 * y la consulta del perfil.
 */
export const requerirVendedor = cache(async (): Promise<SesionVendedor> => {
  const supabase = await crearClienteServidor();

  // getUser valida el token contra el servidor de Auth; getSession solo lee la
  // cookie y por eso no sirve para decidir permisos.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("nombre, rol, activo")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || perfil.rol !== "vendedor" || !perfil.activo) {
    redirect("/sin-acceso");
  }

  return { userId: user.id, nombre: perfil.nombre, supabase };
});
