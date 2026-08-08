import { prisma } from "../../core/db.js";
import type { FechaISO } from "@cbf/shared";

export async function miembrosDeGrupoEnFecha(grupoId: string, fecha: FechaISO): Promise<string[]> {
  const fechaDate = new Date(fecha);
  const filas = await prisma.grupoMiembro.findMany({
    where: {
      grupoId,
      fechaDesde: { lte: fechaDate },
      OR: [{ fechaHasta: null }, { fechaHasta: { gte: fechaDate } }],
    },
    select: { personalId: true },
  });
  return filas.map((f) => f.personalId);
}

export async function agregarMiembroAGrupo(grupoId: string, personalId: string, fechaDesde: FechaISO): Promise<void> {
  // Si ya estaba activo en el grupo (sin fechaHasta), no se duplica.
  const activo = await prisma.grupoMiembro.findFirst({
    where: { grupoId, personalId, fechaHasta: null },
  });
  if (activo) return;
  await prisma.grupoMiembro.create({
    data: { grupoId, personalId, fechaDesde: new Date(fechaDesde) },
  });
}

export async function quitarMiembroDeGrupo(grupoId: string, personalId: string, fecha: FechaISO): Promise<void> {
  await prisma.grupoMiembro.updateMany({
    where: { grupoId, personalId, fechaHasta: null },
    data: { fechaHasta: new Date(fecha) },
  });
}
