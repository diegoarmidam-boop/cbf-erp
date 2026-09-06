import { prisma } from "../../core/db.js";

export const CATEGORIAS_REGULADAS = ["agroquimico", "fertilizante"] as const;

export function esCategoriaRegulada(categoria: string): boolean {
  return (CATEGORIAS_REGULADAS as readonly string[]).includes(categoria);
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
