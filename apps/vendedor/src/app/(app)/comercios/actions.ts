"use server";

import { normalizarCodigoComercio } from "@lbm/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirVendedor } from "@/lib/auth";

export interface ResultadoVisita {
  error: string | null;
  comercioId: string | null;
  visitaId: string | null;
}

// Registra la visita apenas se identifica el comercio (por QR o a mano):
// según docs/PLAN.md, la visita se guarda SIEMPRE al llegar, tenga pedido
// asociado o no — es el log de cobertura de ruta.
async function crearVisita(
  supabase: Awaited<ReturnType<typeof requerirVendedor>>["supabase"],
  vendedorId: string,
  comercioId: string
): Promise<{ error: string | null; visitaId: string | null }> {
  const { data, error } = await supabase
    .from("visitas")
    .insert({ comercio_id: comercioId, vendedor_id: vendedorId })
    .select("id")
    .single();

  if (error) return { error: `No se pudo registrar la visita: ${error.message}`, visitaId: null };
  return { error: null, visitaId: data.id };
}

export async function registrarVisitaPorCodigo(codigo: string): Promise<ResultadoVisita> {
  const { supabase, userId } = await requerirVendedor();

  const { data: comercio } = await supabase
    .from("comercios")
    .select("id")
    .eq("codigo", normalizarCodigoComercio(codigo))
    .eq("activo", true)
    .maybeSingle();

  if (!comercio) {
    return {
      error: "No se encontró un comercio activo con ese código.",
      comercioId: null,
      visitaId: null,
    };
  }

  const { error, visitaId } = await crearVisita(supabase, userId, comercio.id);
  revalidatePath(`/comercios/${comercio.id}`);
  return { error, comercioId: comercio.id, visitaId };
}

export async function registrarVisitaManual(comercioId: string): Promise<ResultadoVisita> {
  const { supabase, userId } = await requerirVendedor();

  const { error, visitaId } = await crearVisita(supabase, userId, comercioId);
  revalidatePath(`/comercios/${comercioId}`);
  return { error, comercioId, visitaId };
}

// Atajo para cuando el cartel del comercio está roto o perdido y no se puede
// escanear: registra la visita igual, a mano, desde la ficha del comercio.
export async function registrarVisitaManualDesdeForm(formData: FormData): Promise<void> {
  const comercioId = String(formData.get("comercioId") ?? "");
  if (!comercioId) return;

  const { visitaId } = await registrarVisitaManual(comercioId);
  redirect(`/comercios/${comercioId}${visitaId ? `?visita=${visitaId}` : ""}`);
}

export interface ItemPedido {
  productoId: string;
  cantidad: number;
}

export async function crearPedido(
  visitaId: string,
  items: ItemPedido[]
): Promise<{ error: string | null; pedidoId: string | null }> {
  const { supabase } = await requerirVendedor();

  if (items.length === 0) {
    return { error: "Elegí al menos un producto.", pedidoId: null };
  }

  const { data, error } = await supabase.rpc("crear_pedido", {
    p_visita_id: visitaId,
    p_items: items.map((item) => ({ producto_id: item.productoId, cantidad: item.cantidad })),
  });

  if (error) return { error: `No se pudo cargar el pedido: ${error.message}`, pedidoId: null };

  revalidatePath("/comercios");
  return { error: null, pedidoId: data };
}
