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
