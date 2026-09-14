"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirAdmin } from "@/lib/auth";
import { exito, fallo, mensajeDeError, type EstadoFormulario } from "@/lib/formularios";

const NOMBRE_DUPLICADO = "Ya existe un producto con ese nombre.";
const ABREVIATURA_DUPLICADA = "Ya hay otro producto con esa abreviatura.";
const LARGO_ABREVIATURA = 20;

interface CamposProducto {
  nombre: string;
  precio: number;
  unidad_medida: string;
  /** null = que la planilla acorte el nombre sola. */
  abreviatura: string | null;
}

function leerCampos(formData: FormData): CamposProducto {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    precio: Number(String(formData.get("precio") ?? "").replace(",", ".")),
    unidad_medida: String(formData.get("unidad_medida") ?? "").trim(),
    // Vacía y sin cargar son lo mismo: la planilla acorta el nombre sola.
    abreviatura: String(formData.get("abreviatura") ?? "").trim() || null,
  };
}

/** Hay dos índices únicos sobre productos: hay que decir cuál se chocó. */
function cualDuplicado(error: { message?: string }): string {
  return (error.message ?? "").includes("abreviatura") ? ABREVIATURA_DUPLICADA : NOMBRE_DUPLICADO;
}

function validar(campos: CamposProducto): string | null {
  if (!campos.nombre) return "El nombre del producto no puede estar vacío.";
  if (!campos.unidad_medida) return "Indicá la unidad de medida (kg, unidad, etc.).";
  if (!Number.isFinite(campos.precio)) return "El precio tiene que ser un número.";
  if (campos.precio < 0) return "El precio no puede ser negativo.";
  if (campos.abreviatura && campos.abreviatura.length > LARGO_ABREVIATURA) {
    return `La abreviatura no puede tener más de ${LARGO_ABREVIATURA} caracteres.`;
  }
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
  if (errorDb) return fallo(mensajeDeError(errorDb, cualDuplicado(errorDb)));

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
  if (errorDb) return fallo(mensajeDeError(errorDb, cualDuplicado(errorDb)));

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
