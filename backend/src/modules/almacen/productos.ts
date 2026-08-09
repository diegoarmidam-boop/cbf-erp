import { prisma } from "../../core/db.js";

export const CATEGORIAS_REGULADAS = ["agroquimico", "fertilizante"] as const;

export function esCategoriaRegulada(categoria: string): boolean {
  return (CATEGORIAS_REGULADAS as readonly string[]).includes(categoria);
}

export interface AltaProductoInput {
  categoria: string;
  ingredienteActivo?: string;
  nombreComercial: string;
  presentacion: string;
  unidad: string;
  requiereLote: boolean;
}

export function listarProductos(categoria?: string) {
  return prisma.producto.findMany({ where: { categoria }, orderBy: { nombreComercial: "asc" } });
}

export function crearProductoAutorizado(input: AltaProductoInput, autorizadoPorId?: string) {
  return prisma.producto.create({
    data: {
      ...input,
      autorizado: true,
      autorizadoPorId,
      fechaAutorizacion: autorizadoPorId ? new Date() : undefined,
    },
  });
}

/** Catálogo de compra: solo productos ya autorizados y activos pueden elegirse (bloque 4/9.5/9.7). */
export function productosAutorizados(categoria?: string) {
  return prisma.producto.findMany({ where: { categoria, autorizado: true, activo: true }, orderBy: { nombreComercial: "asc" } });
}
