import type { FechaISO } from "@cbf/shared";
import { prisma } from "../../core/db.js";

// V1 P6 (27-sep-2026, 9.11f) agrega "falta_justificada" — SOLO para mostrar
// en la Matriz de Asistencia; se lee de BonoAsistenciaAjuste.justificado
// (ya existe, del Bono de Asistencia) sin tocar ni un cálculo de ese
// módulo (84c3d02: el Bono de Asistencia está correcto tal como está).
export type EstadoAsistenciaDia = "cumplio" | "falta_injustificada" | "falta_justificada" | "sin_registro";

export interface DiaAsistencia {
  fecha: FechaISO;
  estado: EstadoAsistenciaDia;
}

/** Días con falta JUSTIFICADA de una persona en un rango — mismo dato que ya usa el Bono de Asistencia, solo lectura. */
async function diasJustificadosEnRango(personalId: string, fechaIni: FechaISO, fechaFin: FechaISO): Promise<Set<FechaISO>> {
  const ajustes = await prisma.bonoAsistenciaAjuste.findMany({
    where: { personalId, justificado: true, fecha: { gte: new Date(fechaIni), lte: new Date(fechaFin) } },
    select: { fecha: true },
  });
  return new Set(ajustes.map((a) => a.fecha.toISOString().slice(0, 10)));
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

  const diasJustificados = await diasJustificadosEnRango(personalId, fechaIni, fechaFin);

  if (persona.tipo === "destajo") {
    const registros = await prisma.registroNomina.findMany({
      where: {
        fecha: { gte: new Date(fechaIni), lte: new Date(fechaFin) },
        OR: [{ personalId }, { grupo: { miembros: { some: { personalId } } } }],
      },
      select: { fecha: true },
    });
    const diasConRegistro = new Set(registros.map((r) => r.fecha.toISOString().slice(0, 10)));
    return fechas.map((fecha) => ({
      fecha,
      estado: diasJustificados.has(fecha) ? "falta_justificada" : diasConRegistro.has(fecha) ? "cumplio" : "sin_registro",
    }));
  }

  const faltas = await prisma.faltaInjustificada.findMany({
    where: { personalId, fecha: { gte: new Date(fechaIni), lte: new Date(fechaFin) } },
    select: { fecha: true },
  });
  const diasConFalta = new Set(faltas.map((f) => f.fecha.toISOString().slice(0, 10)));
  return fechas.map((fecha) => ({
    fecha,
    estado: diasJustificados.has(fecha) ? "falta_justificada" : diasConFalta.has(fecha) ? "falta_injustificada" : "cumplio",
  }));
}

export interface FilaMatrizAsistencia {
  personalId: string;
  nombreCompleto: string;
  dias: DiaAsistencia[];
}

/** Matriz de Asistencia (V1 P6, 27-sep-2026, 9.11f): todas las personas × días — misma tira de calendario de cada persona, en una sola vista. */
export async function matrizAsistencia(fechaIni: FechaISO, fechaFin: FechaISO, huertaId?: string): Promise<FilaMatrizAsistencia[]> {
  const personas = await prisma.personal.findMany({
    where: { activo: true, ...(huertaId ? { huertaId } : {}) },
    orderBy: { nombreCompleto: "asc" },
  });
  return Promise.all(
    personas.map(async (p) => ({
      personalId: p.id,
      nombreCompleto: p.nombreCompleto,
      dias: await tiraAsistenciaPersona(p.id, fechaIni, fechaFin),
    }))
  );
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
