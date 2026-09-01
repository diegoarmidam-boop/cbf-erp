import type { Rol } from "@prisma/client";
import { prisma } from "../../core/db.js";
import type { ModoDosisFertirriego } from "@cbf/shared";

/**
 * Recetario de Fertirriego (27-ago-2026, reversión): modelo propio,
 * separado del Recetario de Aplicaciones (ver módulo recetario/recetario.ts)
 * — Fertirriego usa dosis directa por hectárea, sin concentración, sin
 * litros de mezcla/agua ni Tipo de aplicación, que son campos exclusivos
 * del proceso físico de Aplicaciones y no aplican aquí. Mismo criterio de
 * permisos que el Recetario de Aplicaciones/Fertilizantes en general.
 */
export const ROLES_RECETAS_FERTIRRIEGO: Rol[] = ["director_general", "encargado_sistemas", "gerente_tecnico_produccion"];

export function puedeAdministrarRecetasFertirriego(rol: Rol): boolean {
  return ROLES_RECETAS_FERTIRRIEGO.includes(rol);
}

export interface RecetaFertirriegoProductoInput {
  productoId: string;
  dosisValor: number;
  dosisUnidad: ModoDosisFertirriego;
}

export interface RecetaFertirriegoInput {
  nombre: string;
  productos: RecetaFertirriegoProductoInput[];
}

export function listarRecetasFertirriego(todas = false) {
  return prisma.recetaFertirriego.findMany({
    where: todas ? {} : { activo: true },
    include: { productos: { include: { producto: true } } },
    orderBy: { nombre: "asc" },
  });
}

export function obtenerRecetaFertirriego(id: string) {
  return prisma.recetaFertirriego.findUniqueOrThrow({
    where: { id },
    include: { productos: { include: { producto: true } } },
  });
}

export async function crearRecetaFertirriego(input: RecetaFertirriegoInput, creadoPorId: string) {
  if (input.productos.length === 0) throw new Error("Una receta necesita al menos un producto.");
  return prisma.recetaFertirriego.create({
    data: {
      nombre: input.nombre,
      creadoPorId,
      productos: {
        create: input.productos.map((p) => ({ productoId: p.productoId, dosisValor: p.dosisValor, dosisUnidad: p.dosisUnidad })),
      },
    },
    include: { productos: { include: { producto: true } } },
  });
}

export interface EditarRecetaFertirriegoInput {
  nombre?: string;
  productos?: RecetaFertirriegoProductoInput[];
}

// Reemplaza la lista de productos completa en vez de hacer diff — mismo
// criterio que editarReceta (Aplicaciones): una receta no tiene historial
// propio que preservar por producto.
export async function editarRecetaFertirriego(id: string, input: EditarRecetaFertirriegoInput) {
  return prisma.$transaction(async (tx) => {
    if (input.productos) {
      await tx.recetaFertirriegoProducto.deleteMany({ where: { recetaId: id } });
    }
    return tx.recetaFertirriego.update({
      where: { id },
      data: {
        nombre: input.nombre,
        ...(input.productos
          ? { productos: { create: input.productos.map((p) => ({ productoId: p.productoId, dosisValor: p.dosisValor, dosisUnidad: p.dosisUnidad })) } }
          : {}),
      },
      include: { productos: { include: { producto: true } } },
    });
  });
}

export function actualizarActivoRecetaFertirriego(id: string, activo: boolean) {
  return prisma.recetaFertirriego.update({ where: { id }, data: { activo } });
}

/**
 * "Modificar la receta original" al programar — ajusta la dosis de UN
 * producto específico dentro de la receta maestra, mismo mecanismo que
 * actualizarDosisProductoEnReceta (Aplicaciones).
 */
export function actualizarDosisProductoEnRecetaFertirriego(recetaId: string, productoId: string, dosisValor: number, dosisUnidad: ModoDosisFertirriego) {
  return prisma.recetaFertirriegoProducto.updateMany({
    where: { recetaId, productoId },
    data: { dosisValor, dosisUnidad },
  });
}
