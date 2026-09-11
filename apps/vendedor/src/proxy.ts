import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clavePublica, urlSupabase } from "./lib/env";

const RUTAS_PUBLICAS = ["/login"];

// El navegador pide estos dos sin sesión. Si el proxy los manda al login, el
// service worker no llega a registrarse ("the script resource is behind a
// redirect") y la app deja de abrir sin señal. Se chequea acá y no en el
// matcher porque ahí las exclusiones por nombre de archivo no aplican.
const ARCHIVOS_SIN_SESION = ["/sw.js", "/manifest.webmanifest"];

export async function proxy(request: NextRequest) {
  if (ARCHIVOS_SIN_SESION.includes(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(urlSupabase(), clavePublica(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesAEscribir, headers) {
        cookiesAEscribir.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesAEscribir.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        // Sin estos headers, un CDN podría cachear una respuesta con la cookie
        // de sesión y servírsela a otro usuario.
        Object.entries(headers).forEach(([clave, valor]) => response.headers.set(clave, valor));
      },
    },
  });

  // Además de decidir el redirect, esta llamada refresca el token vencido y
  // escribe las cookies nuevas: los Server Components no pueden hacerlo.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const esRutaPublica = RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)
  );

  if (!user && !esRutaPublica) {
    return redirigir(request, response, "/login");
  }

  if (user && esRutaPublica) {
    return redirigir(request, response, "/comercios");
  }

  return response;
}

/**
 * Si getUser() renovó el token, las cookies nuevas quedaron en `response`.
 * Hay que copiarlas al redirect: si se pierden, el refresh token rotado ya no
 * sirve y el usuario se termina deslogueando solo.
 */
function redirigir(request: NextRequest, response: NextResponse, destino: string) {
  const url = request.nextUrl.clone();
  url.pathname = destino;
  url.search = "";

  const redireccion = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redireccion.cookies.set(cookie));
  return redireccion;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
