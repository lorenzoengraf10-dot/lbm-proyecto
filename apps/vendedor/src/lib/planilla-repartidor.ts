import "server-only";

import { armarPlanilla, type OpcionesPlanilla, type Planilla, type RangoDias } from "@lbm/shared";
import { requerirVendedor } from "./auth";
import { crearClienteServiceRole } from "./supabase-admin";

/**
 * La planilla para el repartidor: la misma que ve el dueño, con todos los
 * comercios y todos los montos.
 *
 * Por qué no sale con su propia sesión: la política pedidos_select
 * (supabase/migrations/20260909000003_rls_policies.sql) limita al vendedor a
 * los pedidos donde vendedor_id = auth.uid(), y pedido_items hereda eso. Con
 * su token, la planilla le mostraría solo lo suyo.
 *
 * Aflojar esa política sería lo fácil y lo peor: ampliaría para siempre lo
 * que el token del repartidor puede leer, incluido desde el navegador y desde
 * la sincronización offline, y va en contra de que esto sea un ecosistema
 * cerrado. En cambio acá se verifica primero quién llama —sesión válida,
 * usuario activo, rol de vendedor— y recién entonces se lee con el cliente de
 * servicio. El permiso ampliado queda en este archivo y no en toda la base.
 *
 * Es el mismo patrón que el login por PIN, que también necesita leer de más
 * antes de que el repartidor tenga sesión.
 *
 * OJO si algún día hay dos repartidores: con esto cada uno ve la cartera y la
 * plata del otro. Acotarlo a lo propio es agregar un filtro por vendedor_id
 * acá adentro.
 */
export async function planillaDelRepartidor(
  rango: RangoDias,
  opciones: OpcionesPlanilla
): Promise<Planilla> {
  // requerirVendedor valida el token contra el servidor de Auth (getUser, no
  // getSession) y chequea rol y activo. Si algo falla, redirige y no se llega
  // a tocar el cliente de servicio.
  await requerirVendedor();
  return armarPlanilla(crearClienteServiceRole(), rango, opciones);
}
