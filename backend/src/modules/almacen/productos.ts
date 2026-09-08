import { prisma } from "../../core/db.js";

/**
 * Bug real corregido (8-sep-2026): esto comparaba `categoria` contra un
 * arreglo fijo `["agroquimico", "fertilizante"]` en minúsculas. Cuando la
 * Categoría se borró y se recreó con otro nombre ("Fertilizante" con
 * mayúscula, vía la pantalla de Catálogos), la comparación dejó de calzar
 * — el regulado dejó de exigir el permiso "almacen_regulado" para
 * autorizar/editar/desactivar, un hueco real de autorización. Ahora
 * consulta las banderas `esFertilizante`/`esAgroquimico` de la Categoría
 * viva (mismo criterio que `requiereIngredienteActivo`, Prioridad 3,
 * 6-sep-2026) — sobreviven a que la Categoría se renombre.
 */
export async function esCategoriaRegulada(categoriaNombre: string): Promise<boolean> {
  const categoria = await prisma.categoriaProducto.findUnique({ where: { nombre: categoriaNombre } });
  return (categoria?.esFertilizante || categoria?.esAgroquimico) ?? false;
}

/** ¿Esta Categoría es de Fertilizante? — usado por Fertirriego/Fertilización Granular para exigir que el producto programado sea uno (mismo bug/corrección de esCategoriaRegulada arriba). */
export async function categoriaEsFertilizante(categoriaNombre: string): Promise<boolean> {
  const categoria = await prisma.categoriaProducto.findUnique({ where: { nombre: categoriaNombre } });
  return categoria?.esFertilizante ?? false;
}

/** ¿Esta Categoría es de Agroquímico? — usado por Aplicaciones para exigir que el producto programado sea uno. */
export async function categoriaEsAgroquimico(categoriaNombre: string): Promise<boolean> {
  const categoria = await prisma.categoriaProducto.findUnique({ where: { nombre: categoriaNombre } });
  return categoria?.esAgroquimico ?? false;
}

/** Nombres de TODAS las Categorías vivas marcadas Fertilizante — para filtrar por lista, no por un solo nombre fijo (ver ingredientesAutorizados). */
export async function nombresCategoriasFertilizante(): Promise<string[]> {
  const categorias = await prisma.categoriaProducto.findMany({ where: { esFertilizante: true } });
  return categorias.map((c) => c.nombre);
}

/** Nombres de TODAS las Categorías vivas marcadas Agroquímico. */
export async function nombresCategoriasAgroquimico(): Promise<string[]> {
  const categorias = await prisma.categoriaProducto.findMany({ where: { esAgroquimico: true } });
  return categorias.map((c) => c.nombre);
}

export interface AltaProductoInput {
  categoria: string;
  ingredienteActivo?: string;
  nombreComercial: string;
  marca?: string;
  unidad: string;
  requiereLote: boolean;
}

export function listarProductos(categoria?: string) {
  return prisma.producto.findMany({ where: { categoria }, orderBy: { nombreComercial: "asc" } });
}

export class IngredienteActivoRequeridoError extends Error {
  constructor(categoria: string) {
    super(`La categoría "${categoria}" requiere capturar un Ingrediente Activo.`);
  }
}

/**
 * Ingrediente Activo obligatorio según la Categoría (Prioridad 3, 4-sep-2026)
 * — nunca se confía solo en que la UI oculte/muestre el campo, se valida
 * también aquí. Devuelve el valor de `ingredienteActivo` a guardar de
 * verdad: `null` si la Categoría no lo requiere (aunque el cliente haya
 * mandado uno — nunca queda un valor viejo colgando si cambia de
 * Categoría), o el capturado si sí lo requiere.
 */
async function resolverIngredienteActivoPorCategoria(input: AltaProductoInput): Promise<string | null> {
  const categoria = await prisma.categoriaProducto.findUnique({ where: { nombre: input.categoria } });
  if (categoria?.requiereIngredienteActivo) {
    if (!input.ingredienteActivo) throw new IngredienteActivoRequeridoError(input.categoria);
    return input.ingredienteActivo;
  }
  return null;
}

export async function crearProductoAutorizado(input: AltaProductoInput, autorizadoPorId?: string) {
  const ingredienteActivo = await resolverIngredienteActivoPorCategoria(input);
  return prisma.producto.create({
    data: {
      ...input,
      ingredienteActivo,
      autorizado: true,
      autorizadoPorId,
      fechaAutorizacion: autorizadoPorId ? new Date() : undefined,
    },
  });
}

/** Editar un producto ya dado de alta — corrige nombre/presentación/ingrediente activo sin perder lotes/movimientos históricos (misma fila, no se recrea). */
export async function editarProducto(id: string, input: AltaProductoInput) {
  const ingredienteActivo = await resolverIngredienteActivoPorCategoria(input);
  return prisma.producto.update({ where: { id }, data: { ...input, ingredienteActivo } });
}

/** Catálogo de compra: solo productos ya autorizados y activos pueden elegirse (bloque 4/9.5/9.7). */
export function productosAutorizados(categoria?: string) {
  return prisma.producto.findMany({ where: { categoria, autorizado: true, activo: true }, orderBy: { nombreComercial: "asc" } });
}
