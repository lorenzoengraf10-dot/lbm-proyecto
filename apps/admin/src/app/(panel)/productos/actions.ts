"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirAdmin, type SesionAdmin } from "@/lib/auth";
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

/**
 * El nombre de un producto y la abreviatura de otro no pueden ser lo mismo.
 *
 * Si existe el producto "Mortadela" y a "Mortadela con pistacho" le ponen de
 * abreviatura "Mortadela", los dos salen igual en la planilla y no hay forma
 * de arreglarlo al imprimir: al de nombre corto no le queda nada más con qué
 * distinguirse. Por eso se corta acá, cuando todavía se puede elegir otra.
 *
 * Se trae el catálogo entero y se compara en memoria en vez de filtrar en la
 * consulta: son veinte productos, y así no depende de qué operadores de
 * comparación de texto soporte el servidor.
 */
async function chocaConOtroProducto(
  supabase: SesionAdmin["supabase"],
  campos: CamposProducto,
  id?: string
): Promise<string | null> {
  const { data } = await supabase.from("productos").select("id, nombre, abreviatura");
  const otros = (data ?? []).filter((producto) => producto.id !== id);
  // Sin distinguir mayúsculas, igual que los índices únicos de la tabla.
  const igual = (a: string | null, b: string | null) =>
    Boolean(a && b) && a!.trim().toLowerCase() === b!.trim().toLowerCase();

  if (campos.abreviatura) {
    const conEseNombre = otros.find((producto) => igual(producto.nombre, campos.abreviatura));
    if (conEseNombre) {
      return `"${campos.abreviatura}" ya es el nombre del producto "${conEseNombre.nombre}". Elegí otra abreviatura.`;
    }
    const conEsaAbreviatura = otros.find((producto) => igual(producto.abreviatura, campos.abreviatura));
    if (conEsaAbreviatura) return ABREVIATURA_DUPLICADA;
  }

  const usaEseNombre = otros.find((producto) => igual(producto.abreviatura, campos.nombre));
  if (usaEseNombre) {
    return `"${campos.nombre}" ya es la abreviatura de "${usaEseNombre.nombre}". Cambiale una de las dos.`;
  }

  return null;
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

  const choque = await chocaConOtroProducto(supabase, campos);
  if (choque) return fallo(choque);

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

  const choque = await chocaConOtroProducto(supabase, campos, id);
  if (choque) return fallo(choque);

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
