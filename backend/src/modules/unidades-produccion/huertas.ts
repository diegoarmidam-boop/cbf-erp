import { calcularAreaEfectiva } from "@cbf/shared";
import { prisma } from "../../core/db.js";

export function listarHuertas() {
  return prisma.huerta.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
}

export function crearHuerta(nombre: string, hectareasTotales: number) {
  return prisma.huerta.create({ data: { nombre, hectareasTotales } });
}

export function actualizarHuerta(id: string, data: { nombre?: string; hectareasTotales?: number; mapaUrl?: string; activo?: boolean }) {
  return prisma.huerta.update({ where: { id }, data });
}

/**
 * Área efectiva + % de aprovechamiento (9.1): suma de hectáreas de la
 * versión VIGENTE de cada Cuadro activo de la Huerta, hoy.
 */
export async function calcularAreaEfectivaHuerta(huertaId: string) {
  const huerta = await prisma.huerta.findUniqueOrThrow({ where: { id: huertaId } });
  const cuadros = await prisma.cuadro.findMany({ where: { huertaId, estatus: "activo" } });
  const hoy = new Date();

  const hectareasPorCuadro: number[] = [];
  for (const cuadro of cuadros) {
    const version = await prisma.cuadroVersion.findFirst({
      where: { cuadroId: cuadro.id, vigenteDesde: { lte: hoy }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: hoy } }] },
    });
    if (version) hectareasPorCuadro.push(Number(version.hectareas));
  }

  return calcularAreaEfectiva(Number(huerta.hectareasTotales), hectareasPorCuadro);
}
