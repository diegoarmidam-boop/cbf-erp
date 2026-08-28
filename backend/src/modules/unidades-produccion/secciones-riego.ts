import { prisma } from "../../core/db.js";

export function listarSeccionesRiego(huertaId: string) {
  return prisma.seccionRiego.findMany({ where: { huertaId }, include: { cuadros: { include: { cuadro: true } } }, orderBy: { nombre: "asc" } });
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
