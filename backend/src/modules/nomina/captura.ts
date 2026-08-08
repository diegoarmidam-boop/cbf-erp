import { candadoDependeEmpacadoresBloquea, tarifaEfectiva, totalRegistro, type FechaISO } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";
import { miembrosDeGrupoEnFecha } from "./grupos.js";
import { aActividadCalc } from "./util.js";

export interface FilaCapturaInput {
  tipo: "individual" | "grupal";
  personalId?: string;
  grupoId?: string;
  actividadId: string;
  cuadroId?: string;
  cantidad: number;
}

export class CapturaInvalidaError extends Error {}
export class DiaCerradoError extends Error {
  constructor() {
    super("Este día ya está cerrado para esta Huerta — no se pueden guardar más capturas.");
  }
}

export async function diaEstaCerrado(huertaId: string, fecha: FechaISO): Promise<boolean> {
  const cierre = await prisma.diaCerrado.findUnique({
    where: { huertaId_fecha: { huertaId, fecha: new Date(fecha) } },
  });
  return !!cierre;
}

/** Registros ya guardados (manual) para una Huerta/fecha, con los datos de actividad ya resueltos. */
export async function obtenerCapturaDelDia(huertaId: string, fecha: FechaISO) {
  return prisma.registroNomina.findMany({
    where: { huertaId, fecha: new Date(fecha), origen: "manual" },
    include: { actividad: true },
  });
}

/** Sugerencia de pre-llenado: mismas personas/grupo/actividad/cuadro que el día anterior con datos, cantidad en blanco. */
export async function obtenerSugerenciaDesdeAyer(huertaId: string, fecha: FechaISO) {
  const ayer = new Date(fecha);
  ayer.setDate(ayer.getDate() - 1);
  const registrosAyer = await prisma.registroNomina.findMany({
    where: { huertaId, fecha: ayer, origen: "manual" },
  });
  return registrosAyer.map((r) => ({
    tipo: r.personalId ? ("individual" as const) : ("grupal" as const),
    personalId: r.personalId ?? undefined,
    grupoId: r.grupoId ?? undefined,
    actividadId: r.actividadId,
    cuadroId: r.cuadroId ?? undefined,
    cantidad: null,
  }));
}

export async function guardarCapturaDelDia(
  huertaId: string,
  fecha: FechaISO,
  filas: FilaCapturaInput[],
  capturadoPorId: string
): Promise<void> {
  if (await diaEstaCerrado(huertaId, fecha)) throw new DiaCerradoError();

  for (const [i, fila] of filas.entries()) {
    if (!fila.actividadId) throw new CapturaInvalidaError(`Fila ${i + 1}: falta la actividad.`);
    if (!fila.cantidad || fila.cantidad <= 0) throw new CapturaInvalidaError(`Fila ${i + 1}: la cantidad debe ser mayor a cero.`);
    if (fila.tipo === "individual" && !fila.personalId) throw new CapturaInvalidaError(`Fila ${i + 1}: falta la persona.`);
    if (fila.tipo === "grupal" && !fila.grupoId) throw new CapturaInvalidaError(`Fila ${i + 1}: falta el grupo.`);
  }

  const actividadIds = [...new Set(filas.map((f) => f.actividadId))];
  const actividades = await prisma.actividad.findMany({ where: { id: { in: actividadIds } } });
  const actividadPorId = new Map(actividades.map((a) => [a.id, a]));

  for (const [i, fila] of filas.entries()) {
    const actividad = actividadPorId.get(fila.actividadId);
    if (!actividad) throw new CapturaInvalidaError(`Fila ${i + 1}: actividad no encontrada.`);
    if (actividad.requiereCuadro && !fila.cuadroId) {
      throw new CapturaInvalidaError(`Fila ${i + 1}: la actividad "${actividad.nombre}" requiere Cuadro.`);
    }
  }

  // Candado del esquema "Depende de Empacadores": si alguien está dado de
  // alta ahí pero no hay ningún registro de Empacador ese día en esa
  // Huerta, se bloquea el guardado completo del día.
  const cajasTotalesEmpacador = filas
    .filter((f) => actividadPorId.get(f.actividadId)?.esquemaPago === "individual_caja")
    .reduce((s, f) => s + f.cantidad, 0);
  const filasDependeEmpacadores = filas.filter((f) => actividadPorId.get(f.actividadId)?.esquemaPago === "depende_empacadores");
  if (candadoDependeEmpacadoresBloquea(filasDependeEmpacadores.length, cajasTotalesEmpacador)) {
    throw new CapturaInvalidaError(
      "Hay personas en una actividad que depende de Empacadores, pero no hay ningún registro de Empacador ese día en esta Huerta."
    );
  }

  const config = await obtenerConfigNomina();

  await prisma.$transaction(async (tx) => {
    await tx.registroNomina.deleteMany({ where: { huertaId, fecha: new Date(fecha), origen: "manual" } });
    for (const fila of filas) {
      const actividad = actividadPorId.get(fila.actividadId)!;
      const tarifaAplicada = tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
      await tx.registroNomina.create({
        data: {
          fecha: new Date(fecha),
          huertaId,
          cuadroId: fila.cuadroId,
          personalId: fila.tipo === "individual" ? fila.personalId : undefined,
          grupoId: fila.tipo === "grupal" ? fila.grupoId : undefined,
          actividadId: fila.actividadId,
          cantidad: fila.cantidad,
          tarifaAplicada,
          origen: "manual",
          capturadoPorId,
        },
      });
    }
  });
}

/** Ganancia por destajo de una persona en un rango de fechas — individual directo, grupal prorrateado entre quienes estaban ese día. */
export async function gananciaDestajoEnRango(personalId: string, fechaIni: FechaISO, fechaFin: FechaISO): Promise<number> {
  const registros = await prisma.registroNomina.findMany({
    where: {
      fecha: { gte: new Date(fechaIni), lte: new Date(fechaFin) },
      OR: [{ personalId }, { grupo: { miembros: { some: { personalId } } } }],
    },
    include: { actividad: true },
  });

  const config = await obtenerConfigNomina();
  let total = 0;
  for (const r of registros) {
    const montoTotal = totalRegistro(Number(r.cantidad), aActividadCalc(r.actividad), config.tarifaGeneralHora);
    if (r.personalId === personalId) {
      total += montoTotal;
    } else if (r.grupoId) {
      const miembros = await miembrosDeGrupoEnFecha(r.grupoId, r.fecha.toISOString().slice(0, 10));
      if (miembros.includes(personalId)) total += montoTotal / (miembros.length || 1);
    }
  }
  return total;
}
