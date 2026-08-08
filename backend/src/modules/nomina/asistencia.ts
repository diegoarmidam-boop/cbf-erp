import type { FechaISO } from "@cbf/shared";
import { prisma } from "../../core/db.js";

export type EstadoAsistenciaDia = "cumplio" | "falta_injustificada" | "sin_registro";

export interface DiaAsistencia {
  fecha: FechaISO;
  estado: EstadoAsistenciaDia;
}

/**
 * Tira de calendario por persona (L-S). Para personal de destajo, "cumplió"
 * = tuvo algún RegistroNomina ese día; no hay "falta injustificada" propia
 * porque simplemente no se le paga ese día (gris = sin registro).
 * Para personal fijo, se asume presente salvo que haya una
 * FaltaInjustificada explícita — el gris ahí significa "sin capturar
 * todavía", no "no vino".
 */
export async function tiraAsistenciaPersona(personalId: string, fechaIni: FechaISO, fechaFin: FechaISO): Promise<DiaAsistencia[]> {
  const persona = await prisma.personal.findUniqueOrThrow({ where: { id: personalId } });

  const fechas: FechaISO[] = [];
  const cursor = new Date(fechaIni);
  const fin = new Date(fechaFin);
  while (cursor <= fin) {
    fechas.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  if (persona.tipo === "destajo") {
    const registros = await prisma.registroNomina.findMany({
      where: {
        fecha: { gte: new Date(fechaIni), lte: new Date(fechaFin) },
        OR: [{ personalId }, { grupo: { miembros: { some: { personalId } } } }],
      },
      select: { fecha: true },
    });
    const diasConRegistro = new Set(registros.map((r) => r.fecha.toISOString().slice(0, 10)));
    return fechas.map((fecha) => ({ fecha, estado: diasConRegistro.has(fecha) ? "cumplio" : "sin_registro" }));
  }

  const faltas = await prisma.faltaInjustificada.findMany({
    where: { personalId, fecha: { gte: new Date(fechaIni), lte: new Date(fechaFin) } },
    select: { fecha: true },
  });
  const diasConFalta = new Set(faltas.map((f) => f.fecha.toISOString().slice(0, 10)));
  return fechas.map((fecha) => ({ fecha, estado: diasConFalta.has(fecha) ? "falta_injustificada" : "cumplio" }));
}

export async function registrarFaltaInjustificada(personalId: string, fecha: FechaISO, registradoPorId: string, notas?: string) {
  return prisma.faltaInjustificada.upsert({
    where: { personalId_fecha: { personalId, fecha: new Date(fecha) } },
    update: { notas, registradoPorId },
    create: { personalId, fecha: new Date(fecha), notas, registradoPorId },
  });
}

export async function quitarFaltaInjustificada(personalId: string, fecha: FechaISO): Promise<void> {
  await prisma.faltaInjustificada.deleteMany({ where: { personalId, fecha: new Date(fecha) } });
}
