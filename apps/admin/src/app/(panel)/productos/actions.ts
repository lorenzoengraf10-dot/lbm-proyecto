"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirAdmin } from "@/lib/auth";
import { exito, fallo, mensajeDeError, type EstadoFormulario } from "@/lib/formularios";

const NOMBRE_DUPLICADO = "Ya existe un producto con ese nombre.";

interface CamposProducto {
  nombre: string;
  precio: number;
  unidad_medida: string;
}

function leerCampos(formData: FormData): CamposProducto {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    precio: Number(String(formData.get("precio") ?? "").replace(",", ".")),
    unidad_medida: String(formData.get("unidad_medida") ?? "").trim(),
  };
}

function validar(campos: CamposProducto): string | null {
  if (!campos.nombre) return "El nombre del producto no puede estar vacío.";
  if (!campos.unidad_medida) return "Indicá la unidad de medida (kg, unidad, etc.).";
  if (!Number.isFinite(campos.precio)) return "El precio tiene que ser un número.";
  if (campos.precio < 0) return "El precio no puede ser negativo.";
  return null;
}

export async function crearProducto(
  _estadoPrevio: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const { supabase } = await requerirAdmin();

  const campos = leerCampos(formData);
  const error = validar(campos);
  if (error) return fallo(error);

  const { error: errorDb } = await supabase.from("productos").insert(campos);
  if (errorDb) return fallo(mensajeDeError(errorDb, NOMBRE_DUPLICADO));

  revalidatePath("/productos");
  return exito(`Producto "${campos.nombre}" creado.`);
}

export async function actualizarProducto(
  _estadoPrevio: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const { supabase } = await requerirAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return fallo("Falta el producto a editar.");

  const campos = leerCampos(formData);
  const error = validar(campos);
  if (error) return fallo(error);

  // Cambiar el precio acá no toca los pedidos ya cargados: cada ítem guarda
  // el precio que tenía el producto en el momento de la venta.
  const { error: errorDb } = await supabase.from("productos").update(campos).eq("id", id);
  if (errorDb) return fallo(mensajeDeError(errorDb, NOMBRE_DUPLICADO));

  revalidatePath("/productos");
  revalidatePath(`/productos/${id}`);
  return exito("Cambios guardados.");
}

// Elimina el producto de verdad (no la baja lógica de cambiarEstadoProducto).
// Solo funciona si nunca se vendió — si aparece en algún pedido, se rechaza
// para no perder ese histórico, y hay que darlo de baja en su lugar.
export async function eliminarProducto(
  _estadoPrevio: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const { supabase } = await requerirAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return fallo("Falta el producto a eliminar.");

  const { count: enPedidos } = await supabase
    .from("pedido_items")
    .select("id", { count: "exact", head: true })
    .eq("producto_id", id);

  if ((enPedidos ?? 0) > 0) {
    return fallo("No se puede eliminar: ya está en pedidos cargados. Dalo de baja en su lugar.");
  }

  const { error: errorDb } = await supabase.from("productos").delete().eq("id", id);
  if (errorDb) return fallo(mensajeDeError(errorDb, NOMBRE_DUPLICADO));

  revalidatePath("/productos");
  redirect("/productos");
}

export async function cambiarEstadoProducto(formData: FormData): Promise<void> {
  const { supabase } = await requerirAdmin();

  const id = String(formData.get("id") ?? "");
  const activo = formData.get("activo") === "true";
  if (!id) return;

  await supabase.from("productos").update({ activo }).eq("id", id);

  revalidatePath("/productos");
  revalidatePath(`/productos/${id}`);
}
