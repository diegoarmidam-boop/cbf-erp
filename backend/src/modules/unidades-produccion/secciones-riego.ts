import { ordenarPorNombreNumerico } from "@cbf/shared";
import { prisma } from "../../core/db.js";

export async function listarSeccionesRiego(huertaId: string) {
  const secciones = await prisma.seccionRiego.findMany({
    where: { huertaId },
    include: { cuadros: { include: { cuadro: true } } },
  });
  for (const s of secciones) {
    s.cuadros = ordenarPorNombreNumerico(s.cuadros, (sc) => sc.cuadro.nombre);
  }
  return ordenarPorNombreNumerico(secciones, (s) => s.nombre);
}

export async function crearSeccionRiego(huertaId: string, nombre: string, cuadroIds: string[]) {
  return prisma.$transaction(async (tx) => {
    const seccion = await tx.seccionRiego.create({ data: { huertaId, nombre } });
    for (const cuadroId of cuadroIds) {
      await tx.seccionRiegoCuadro.create({ data: { seccionId: seccion.id, cuadroId } });
    }
    return seccion;
  });
}

export async function actualizarCuadrosSeccion(seccionId: string, cuadroIds: string[]) {
  return prisma.$transaction(async (tx) => {
    await tx.seccionRiegoCuadro.deleteMany({ where: { seccionId } });
    for (const cuadroId of cuadroIds) {
      await tx.seccionRiegoCuadro.create({ data: { seccionId, cuadroId } });
    }
  });
}

/** Líneas de cintilla vigentes de una Sección en una fecha (Prioridad 4, 14-sep-2026) — mismo patrón que obtenerVersionVigente (Cuadro, 9.1). */
export async function lineasCintillaVigentes(seccionId: string, fecha: Date): Promise<number | null> {
  const version = await prisma.seccionRiegoLineasCintilla.findFirst({
    where: { seccionId, vigenteDesde: { lte: fecha }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fecha } }] },
  });
  return version?.lineas ?? null;
}

/**
 * Cambiar las líneas de cintilla de una Sección (ej. de 1 a 2 a mitad del
 * Ciclo) no sobreescribe el valor vigente — lo cierra y abre uno nuevo,
 * para conservar el historial por fecha (mismo criterio que
 * actualizarConfiguracionCuadro, 9.1).
 */
export async function actualizarLineasCintilla(seccionId: string, lineas: number, vigenteDesde: string) {
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.seccionRiegoLineasCintilla.findFirst({ where: { seccionId, vigenteHasta: null } });
    if (anterior) {
      const diaAnterior = new Date(vigenteDesde);
      diaAnterior.setDate(diaAnterior.getDate() - 1);
      await tx.seccionRiegoLineasCintilla.update({ where: { id: anterior.id }, data: { vigenteHasta: diaAnterior } });
    }
    return tx.seccionRiegoLineasCintilla.create({ data: { seccionId, lineas, vigenteDesde: new Date(vigenteDesde) } });
  });
}

export function historialLineasCintilla(seccionId: string) {
  return prisma.seccionRiegoLineasCintilla.findMany({ where: { seccionId }, orderBy: { vigenteDesde: "desc" } });
}
