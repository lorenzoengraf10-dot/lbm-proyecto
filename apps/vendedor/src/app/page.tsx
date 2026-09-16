import { redirect } from "next/navigation";

/**
 * La app abre en la cámara.
 *
 * Desde que el pedido solo se carga escaneando, escanear es el arranque de
 * todo: abrir en el listado era un toque de más en lo único que el repartidor
 * hace cincuenta veces por mañana. El listado sigue a un toque, para buscar un
 * comercio o cargar sin QR cuando el cartel no está.
 */
export default function Inicio() {
  redirect("/escanear");
}
