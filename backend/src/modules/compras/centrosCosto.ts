import { prisma } from "../../core/db.js";

/**
 * Catálogo abierto de Centros de Costo (4.1, 2-sep-2026, Bloque 3 del
 * documento) — mismo patrón "+" que los catálogos abiertos de Producto (ver
 * almacen/catalogos.ts), propio de Compras porque alimenta el Destino de
 * las solicitudes manuales, no el alta de Producto.
 */
export function listarCentrosCosto(todas = false) {
  return prisma.centroCosto.findMany({ where: todas ? undefined : { activo: true }, orderBy: { nombre: "asc" } });
}

export function crearCentroCosto(nombre: string) {
  return prisma.centroCosto.create({ data: { nombre } });
}

export function actualizarActivoCentroCosto(id: string, activo: boolean) {
  return prisma.centroCosto.update({ where: { id }, data: { activo } });
}
