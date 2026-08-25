import type { ConcentracionUnidad, ModuloReceta, Rol } from "@prisma/client";
import { prisma } from "../../core/db.js";

/**
 * Recetario (20-ago-2026): paquetes técnicos precargados de Aplicaciones y
 * Fertirriego — capa adicional sobre la forma libre de programar por
 * Ingrediente Activo, que se mantiene exactamente igual sin receta.
 */

// Crear/editar recetas maestras, y ajustar la dosis de un producto al
// programar con una receta: solo Director General y Gerente Técnico de
// Producción — mismo criterio que ya se usa para autorizar productos
// nuevos en Aplicaciones/Fertilizantes. Vive aquí (no en recetario.routes)
// porque programarAplicacion/programarFertirriego (fuera de este módulo)
// también necesitan este mismo criterio para validar quién puede desviarse
// de la dosis de la receta.
export const ROLES_RECETAS: Rol[] = ["director_general", "encargado_sistemas", "gerente_tecnico_produccion"];

export function puedeAdministrarRecetas(rol: Rol): boolean {
  return ROLES_RECETAS.includes(rol);
}

export const tiposAplicacion = {
  listar: (todas = false) => prisma.tipoAplicacion.findMany({ where: todas ? undefined : { activo: true }, orderBy: { nombre: "asc" } }),
  crear: (nombre: string) => prisma.tipoAplicacion.create({ data: { nombre } }),
  actualizarActivo: (id: string, activo: boolean) => prisma.tipoAplicacion.update({ where: { id }, data: { activo } }),
};

export interface RecetaProductoInput {
  productoId: string;
  concentracionValor: number;
  concentracionUnidad: ConcentracionUnidad;
}

export interface RecetaInput {
  nombre: string;
  modulo: ModuloReceta;
  tipoAplicacionId?: string;
  litrosPorHa: number;
  productos: RecetaProductoInput[];
}

export function listarRecetas(modulo: ModuloReceta, todas = false) {
  return prisma.receta.findMany({
    where: { modulo, ...(todas ? {} : { activo: true }) },
    include: { tipoAplicacion: true, productos: { include: { producto: true } } },
    orderBy: { nombre: "asc" },
  });
}

export function obtenerReceta(id: string) {
  return prisma.receta.findUniqueOrThrow({
    where: { id },
    include: { tipoAplicacion: true, productos: { include: { producto: true } } },
  });
}

export async function crearReceta(input: RecetaInput, creadoPorId: string) {
  if (input.productos.length === 0) throw new Error("Una receta necesita al menos un producto.");
  return prisma.receta.create({
    data: {
      nombre: input.nombre,
      modulo: input.modulo,
      tipoAplicacionId: input.tipoAplicacionId,
      litrosPorHa: input.litrosPorHa,
      creadoPorId,
      productos: {
        create: input.productos.map((p) => ({
          productoId: p.productoId,
          concentracionValor: p.concentracionValor,
          concentracionUnidad: p.concentracionUnidad,
        })),
      },
    },
    include: { tipoAplicacion: true, productos: { include: { producto: true } } },
  });
}

export interface EditarRecetaInput {
  nombre?: string;
  tipoAplicacionId?: string | null;
  litrosPorHa?: number;
  productos?: RecetaProductoInput[];
}

// Reemplaza la lista de productos completa en vez de hacer diff — más
// simple y suficiente aquí, una receta no tiene historial propio que
// preservar por producto (a diferencia de una Aplicación ya programada,
// que sí necesita conservar cada reporte).
export async function editarReceta(id: string, input: EditarRecetaInput) {
  return prisma.$transaction(async (tx) => {
    if (input.productos) {
      await tx.recetaProducto.deleteMany({ where: { recetaId: id } });
    }
    return tx.receta.update({
      where: { id },
      data: {
        nombre: input.nombre,
        tipoAplicacionId: input.tipoAplicacionId,
        litrosPorHa: input.litrosPorHa,
        ...(input.productos
          ? {
              productos: {
                create: input.productos.map((p) => ({
                  productoId: p.productoId,
                  concentracionValor: p.concentracionValor,
                  concentracionUnidad: p.concentracionUnidad,
                })),
              },
            }
          : {}),
      },
      include: { tipoAplicacion: true, productos: { include: { producto: true } } },
    });
  });
}

export function actualizarActivoReceta(id: string, activo: boolean) {
  return prisma.receta.update({ where: { id }, data: { activo } });
}

/**
 * "Modificar la receta original" al programar (bloque nuevo, 20-ago-2026):
 * ajusta la dosis de UN producto específico dentro de la receta maestra —
 * más quirúrgico que editarReceta (que reemplaza la lista completa), para
 * no tener que reenviar todos los productos solo por ajustar uno.
 */
export function actualizarDosisProductoEnReceta(
  recetaId: string,
  productoId: string,
  concentracionValor: number,
  concentracionUnidad: ConcentracionUnidad
) {
  return prisma.recetaProducto.updateMany({
    where: { recetaId, productoId },
    data: { concentracionValor, concentracionUnidad },
  });
}
