"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirVendedor } from "@/lib/auth";
import { fallo, type EstadoFormulario } from "@/lib/formularios";
import type { ItemPedido } from "@/components/formulario-pedido";

export async function actualizarPedido(
  pedidoId: string,
  items: ItemPedido[]
): Promise<{ error: string | null }> {
  const { supabase } = await requerirVendedor();

  if (items.length === 0) {
    return { error: "Dejá al menos un producto, o anulá el pedido." };
  }

  const { error } = await supabase.rpc("actualizar_pedido", {
    p_pedido_id: pedidoId,
    p_items: items.map((item) => ({ producto_id: item.productoId, cantidad: item.cantidad })),
  });

  if (error) {
    return { error: `No se pudo corregir el pedido: ${error.message}` };
  }

  revalidatePath("/mis-pedidos");
  revalidatePath(`/mis-pedidos/${pedidoId}`);
  return { error: null };
}

// Anular = borrar el pedido. Los ítems se van en cascada; la visita queda,
// porque la visita igual pasó aunque al final no se haya vendido nada.
//
// El .select() no es decorativo: si la RLS bloquea el borrado (pedido de otro
// día o de otro vendedor) Postgres no tira error, simplemente no borra nada.
// Sin mirar las filas devueltas, la pantalla diría "listo" sin haber hecho
// nada.
export async function anularPedido(
  _estadoPrevio: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const { supabase } = await requerirVendedor();

  const id = String(formData.get("id") ?? "");
  if (!id) return fallo("Falta el pedido a anular.");

  const { data, error } = await supabase.from("pedidos").delete().eq("id", id).select("id");

  if (error) return fallo(`No se pudo anular: ${error.message}`);
  if ((data ?? []).length === 0) {
    return fallo("No se pudo anular: el pedido ya no es del día de hoy.");
  }

  revalidatePath("/mis-pedidos");
  redirect("/mis-pedidos");
}
