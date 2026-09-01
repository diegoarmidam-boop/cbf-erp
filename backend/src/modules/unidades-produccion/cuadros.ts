import { ordenarPorNombreNumerico, plantasTotalesCuadro } from "@cbf/shared";
import { prisma } from "../../core/db.js";

export interface VersionCuadroInput {
  hectareas: number;
  tipoSuelo?: string;
  fechaSiembra?: string;
  distSurcosM?: number;
  distPlantasM?: number;
}

export async function listarCuadros(huertaId: string) {
  const cuadros = await prisma.cuadro.findMany({
    where: { huertaId },
    include: { versiones: { orderBy: { vigenteDesde: "desc" } } },
  });
  return ordenarPorNombreNumerico(cuadros, (c) => c.nombre);
}

export async function crearCuadro(huertaId: string, nombre: string, version: VersionCuadroInput, vigenteDesde: string) {
  return prisma.$transaction(async (tx) => {
    const cuadro = await tx.cuadro.create({ data: { huertaId, nombre } });
    await tx.cuadroVersion.create({
      data: {
        cuadroId: cuadro.id,
        vigenteDesde: new Date(vigenteDesde),
        hectareas: version.hectareas,
        tipoSuelo: version.tipoSuelo,
        fechaSiembra: version.fechaSiembra ? new Date(version.fechaSiembra) : undefined,
        distSurcosM: version.distSurcosM,
        distPlantasM: version.distPlantasM,
      },
    });
    return cuadro;
  });
}

/**
 * Un cambio de configuración (recalle, ajuste de calles) no sobreescribe
 * la versión vigente — la cierra y abre una nueva, para conservar el
 * historial por fecha (9.1).
 */
export async function actualizarConfiguracionCuadro(cuadroId: string, version: VersionCuadroInput, vigenteDesde: string) {
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.cuadroVersion.findFirst({ where: { cuadroId, vigenteHasta: null } });
    if (anterior) {
      const diaAnterior = new Date(vigenteDesde);
      diaAnterior.setDate(diaAnterior.getDate() - 1);
      await tx.cuadroVersion.update({ where: { id: anterior.id }, data: { vigenteHasta: diaAnterior } });
    }
    return tx.cuadroVersion.create({
      data: {
        cuadroId,
        vigenteDesde: new Date(vigenteDesde),
        hectareas: version.hectareas,
        tipoSuelo: version.tipoSuelo,
        fechaSiembra: version.fechaSiembra ? new Date(version.fechaSiembra) : undefined,
        distSurcosM: version.distSurcosM,
        distPlantasM: version.distPlantasM,
      },
    });
  });
}

export function actualizarCamposPersonalizados(cuadroId: string, camposPersonalizados: Record<string, unknown>) {
  return prisma.cuadro.update({ where: { id: cuadroId }, data: { camposPersonalizados } });
}

export function cambiarEstatusCuadro(cuadroId: string, estatus: "activo" | "en_descanso" | "fuera_produccion") {
  return prisma.cuadro.update({ where: { id: cuadroId }, data: { estatus } });
}

export async function obtenerVersionVigente(cuadroId: string, fecha: Date = new Date()) {
  return prisma.cuadroVersion.findFirst({
    where: { cuadroId, vigenteDesde: { lte: fecha }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fecha } }] },
  });
}

/** Plantas totales del cuadro según su Marco de Plantación vigente (alimenta Fertilizantes, modo g/planta). */
export async function plantasTotalesVigentes(cuadroId: string): Promise<number | null> {
  const version = await obtenerVersionVigente(cuadroId);
  if (!version || !version.distSurcosM || !version.distPlantasM) return null;
  return plantasTotalesCuadro(Number(version.hectareas), Number(version.distSurcosM), Number(version.distPlantasM));
}
