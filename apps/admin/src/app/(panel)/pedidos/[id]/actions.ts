"use server";

import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import { exito, fallo, type EstadoFormulario } from "@/lib/formularios";

export async function corregirPedido(
  _estadoPrevio: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const { supabase } = await requerirAdmin();

  const pedidoId = String(formData.get("pedido_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!pedidoId) return fallo("Falta el pedido a corregir.");
  if (!motivo) return fallo("Contá en una línea qué se corrigió y por qué.");

  // El formulario manda un campo cantidad_<id> y precio_<id> por cada
  // producto del catálogo (los que tenía el pedido y los que no); acá se
  // arma la lista final descartando los que quedaron en 0 o vacíos.
  const items: { producto_id: string; cantidad: number; precio_unitario: number }[] = [];

  for (const [clave, valor] of formData.entries()) {
    const coincide = clave.match(/^cantidad_(.+)$/);
    if (!coincide) continue;

    const cantidad = Number(String(valor).replace(",", "."));
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue;

    const productoId = coincide[1];
    const precioUnitario = Number(
      String(formData.get(`precio_${productoId}`) ?? "").replace(",", ".")
    );
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
      return fallo(`El precio de uno de los ítems no es un número válido.`);
    }

    items.push({ producto_id: productoId, cantidad, precio_unitario: precioUnitario });
  }

  if (items.length === 0) {
    return fallo("El pedido necesita al menos un ítem con cantidad mayor a 0.");
  }

  const { error } = await supabase.rpc("corregir_pedido_admin", {
    p_pedido_id: pedidoId,
    p_items: items,
    p_motivo: motivo,
  });
  if (error) return fallo(`No se pudo corregir: ${error.message}`);

  revalidatePath(`/pedidos/${pedidoId}`);
  revalidatePath("/pedidos");
  revalidatePath("/comisiones");
  revalidatePath("/reportes");
  revalidatePath("/");
  return exito("Pedido corregido: el total y la comisión ya se recalcularon solos.");
}
