import { tarifaEfectiva } from "@cbf/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
import { obtenerVersionVigente } from "../unidades-produccion/cuadros.js";
import { obtenerConfigNomina } from "../nomina/config.js";
import { aActividadCalc } from "../nomina/util.js";
import { diaEstaCerrado } from "../nomina/captura.js";

/**
 * Alcance inicial del módulo (9.4, confirmado 10-ago-2026): puro mano de
 * obra, sin insumo ni maquinaria. El resto del catálogo de Actividades se
 * agrega después, conforme se necesite — Riego y Fertilización tienen su
 * propio módulo (9.6 y 9.5), no viven aquí.
 */
export const ACTIVIDADES_MODULO_NOMBRES = ["Bodega", "Ahoyado", "Siembra", "Vivero", "Chapeo", "Tirar Cinta", "Limpieza"];

export class ActividadFueraDeAlcanceError extends Error {
  constructor() {
    super("Esta actividad todavía no está cubierta por este módulo — se sigue capturando directo en Nómina.");
  }
}

export class SuperficieExcedeCuadroReporteActividadError extends Error {
  constructor(nombreCuadro: string, hectareasCuadro: number, hectareasAcumuladas: number) {
    super(
      `El Cuadro "${nombreCuadro}" tiene ${hectareasCuadro} ha, pero entre todos los reportes de esta actividad se acumularían ${hectareasAcumuladas.toFixed(4)} ha — la suma no puede exceder la superficie del Cuadro.`
    );
  }
}

export class DiaCerradoActividadError extends Error {
  constructor() {
    super("La Huerta ya tiene cerrado el día de Nómina de este reporte — no se puede editar (candado de consistencia con Nómina).");
  }
}

export class DiaCerradoRequiereCasoExtraordinarioActividadError extends Error {
  constructor() {
    super(
      "La Huerta ya tiene cerrado el día de Nómina de esta fecha — para que este registro cuente, se necesita autorización de caso extraordinario (Encargado de Nóminas, Director General o Gerente Administrativo)."
    );
  }
}

/** Catálogo de actividades elegibles al programar (9.4) — solo las del alcance inicial de este módulo. */
export function actividadesParaProgramar() {
  return prisma.actividad.findMany({
    where: { nombre: { in: ACTIVIDADES_MODULO_NOMBRES }, activo: true },
    orderBy: { nombre: "asc" },
  });
}

export interface ProgramarActividadInput {
  huertaId: string;
  cuadroIds: string[];
  actividadId: string;
  fechaInicio: string;
  fechaFin: string;
}

/** Paso 1, Programar (9.4): sin gate de Almacén — no hay insumo que entregar, así que se puede reportar avance desde que se programa. */
export async function programarActividad(input: ProgramarActividadInput, creadoPorId: string) {
  if (input.cuadroIds.length === 0) {
    throw new Error("Elige al menos un Cuadro.");
  }
  const actividad = await prisma.actividad.findUniqueOrThrow({ where: { id: input.actividadId } });
  if (!ACTIVIDADES_MODULO_NOMBRES.includes(actividad.nombre)) {
    throw new ActividadFueraDeAlcanceError();
  }

  let hectareasTotales = 0;
  const fechaRef = new Date(input.fechaInicio);
  for (const cuadroId of input.cuadroIds) {
    const version = await obtenerVersionVigente(cuadroId, fechaRef);
    if (!version) throw new Error("El Cuadro elegido no tiene una configuración vigente para la fecha de inicio.");
    hectareasTotales += Number(version.hectareas);
  }

  return prisma.$transaction(async (tx) => {
    const programada = await tx.actividadProgramada.create({
      data: {
        huertaId: input.huertaId,
        actividadId: input.actividadId,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        hectareasTotalesProgramadas: hectareasTotales,
        creadoPorId,
      },
    });
    await tx.actividadProgramadaCuadro.createMany({
      data: input.cuadroIds.map((cuadroId) => ({ actividadProgramadaId: programada.id, cuadroId })),
    });
    return programada;
  });
}

const INCLUDE_ACTIVIDAD_PROGRAMADA = {
  huerta: true,
  actividad: true,
  cuadros: { include: { cuadro: true } },
  realizadas: {
    include: { cuadros: { include: { cuadro: true } }, personas: { include: { personal: true } } },
    orderBy: { fechaReal: "desc" as const },
  },
};

type ActividadProgramadaConRealizadas = {
  id: string;
  actividad: { tarifa: unknown; usarTarifaGeneral: boolean };
  hectareasTotalesProgramadas: Prisma.Decimal;
  cuadros: { cuadroId: string; cuadro: { nombre: string } }[];
  realizadas: { id: string; cuadros: { cuadroId: string; hectareas: Prisma.Decimal }[]; personas: { horas: Prisma.Decimal }[] }[];
};

/** Hectáreas restantes por Cuadro (9.4, mismo mecanismo que Aplicaciones 9.7): lo que falta de reportar de cada Cuadro programado. */
async function hectareasRestantesPorCuadro(programada: ActividadProgramadaConRealizadas, excluirRealizadaId?: string): Promise<Record<string, number>> {
  const restantes: Record<string, number> = {};
  for (const { cuadroId } of programada.cuadros) {
    const version = await obtenerVersionVigente(cuadroId);
    const totalCuadro = version ? Number(version.hectareas) : 0;
    const reportadas = programada.realizadas
      .filter((r) => r.id !== excluirRealizadaId)
      .reduce((s, r) => s + r.cuadros.filter((c) => c.cuadroId === cuadroId).reduce((s2, c) => s2 + Number(c.hectareas), 0), 0);
    restantes[cuadroId] = Math.max(0, totalCuadro - reportadas);
  }
  return restantes;
}

async function enriquecerConAlertas<T extends ActividadProgramadaConRealizadas>(programada: T, tarifaGeneralHora: number | null) {
  const hectareasAvanzadas = programada.realizadas.reduce((s, r) => s + r.cuadros.reduce((s2, c) => s2 + Number(c.hectareas), 0), 0);
  const horasHombreTotales = programada.realizadas.reduce((s, r) => s + r.personas.reduce((s2, p) => s2 + Number(p.horas), 0), 0);
  const porcentajeAvance = Number(programada.hectareasTotalesProgramadas) > 0 ? (hectareasAvanzadas / Number(programada.hectareasTotalesProgramadas)) * 100 : 0;
  const restantesPorCuadro = await hectareasRestantesPorCuadro(programada);
  const costoTotal = horasHombreTotales * tarifaEfectiva(aActividadCalc(programada.actividad), tarifaGeneralHora);

  return {
    ...programada,
    hectareasAvanzadas,
    horasHombreTotales,
    porcentajeAvance,
    restantesPorCuadro,
    costoTotal,
  };
}

export async function listarActividadesProgramadas(huertaId?: string) {
  const config = await obtenerConfigNomina();
  const items = await prisma.actividadProgramada.findMany({
    where: { huertaId },
    include: INCLUDE_ACTIVIDAD_PROGRAMADA,
    orderBy: { fechaCreacion: "desc" },
  });
  return Promise.all(items.map((a) => enriquecerConAlertas(a, config.tarifaGeneralHora)));
}

export async function obtenerActividadProgramada(id: string) {
  const config = await obtenerConfigNomina();
  const programada = await prisma.actividadProgramada.findUniqueOrThrow({
    where: { id },
    include: INCLUDE_ACTIVIDAD_PROGRAMADA,
  });
  return enriquecerConAlertas(programada, config.tarifaGeneralHora);
}

export interface CuadroAvanceInput {
  cuadroId: string;
  hectareas: number;
}

export interface PersonaAvanceInput {
  personalId: string;
  horas: number;
}

export interface RegistrarAvanceActividadInput {
  fechaReal: string;
  cuadros: CuadroAvanceInput[];
  personas: PersonaAvanceInput[];
  casoExtraordinario?: boolean;
}

/**
 * Candado (9.4, mismo mecanismo que Aplicaciones 9.7): la suma acumulada de
 * hectáreas reportadas de un mismo Cuadro, a través de TODOS los reportes
 * de una Actividad programada, no puede exceder la superficie vigente de
 * ese Cuadro.
 */
async function validarCandadoCuadrosReporte(actividadProgramadaId: string, cuadros: CuadroAvanceInput[], excluirRealizadaId?: string) {
  for (const c of cuadros) {
    const yaReportadas = await prisma.actividadRealizadaCuadro.aggregate({
      _sum: { hectareas: true },
      where: {
        cuadroId: c.cuadroId,
        realizada: { actividadProgramadaId, ...(excluirRealizadaId ? { id: { not: excluirRealizadaId } } : {}) },
      },
    });
    const acumuladas = Number(yaReportadas._sum.hectareas ?? 0) + c.hectareas;
    const version = await obtenerVersionVigente(c.cuadroId);
    if (version && acumuladas > Number(version.hectareas) + 0.0001) {
      const cuadro = await prisma.cuadro.findUnique({ where: { id: c.cuadroId } });
      throw new SuperficieExcedeCuadroReporteActividadError(cuadro?.nombre ?? c.cuadroId, Number(version.hectareas), acumuladas);
    }
  }
}

async function crearPersonasYNomina(
  tx: TransactionClient,
  realizadaId: string,
  huertaId: string,
  actividadId: string,
  cuadroIdUnico: string | undefined,
  fecha: Date,
  personas: PersonaAvanceInput[],
  tarifaAplicada: number,
  registradoPorId: string
) {
  for (const p of personas) {
    await tx.actividadRealizadaPersona.create({ data: { realizadaId, personalId: p.personalId, horas: p.horas } });
    await tx.registroNomina.create({
      data: {
        fecha,
        huertaId,
        cuadroId: cuadroIdUnico,
        personalId: p.personalId,
        actividadId,
        cantidad: p.horas,
        tarifaAplicada,
        origen: "automatico_actividad",
        referenciaOrigenId: realizadaId,
        capturadoPorId: registradoPorId,
      },
    });
  }
}

/**
 * Paso 2, Registrar avance (9.4) — mismo patrón que Aplicaciones (9.7): cada
 * reporte captura qué Cuadro(s) se avanzaron y cuántas hectáreas de cada
 * uno, más quién trabajó y cuántas horas cada uno. Genera mano de obra
 * automática en Nómina (origen=automatico_actividad); a diferencia de
 * Aplicaciones, no hay Almacén Local que descontar — esta actividad no
 * consume insumo.
 */
export async function registrarAvanceActividad(actividadProgramadaId: string, input: RegistrarAvanceActividadInput, registradoPorId: string) {
  if (!input.personas || input.personas.length === 0) throw new Error("Falta capturar al menos una persona en este reporte.");
  if (!input.cuadros || input.cuadros.length === 0) throw new Error("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");

  const programada = await prisma.actividadProgramada.findUniqueOrThrow({
    where: { id: actividadProgramadaId },
    include: { cuadros: true, actividad: true },
  });
  const cuadroIdsProgramados = new Set(programada.cuadros.map((c) => c.cuadroId));
  for (const c of input.cuadros) {
    if (!cuadroIdsProgramados.has(c.cuadroId)) throw new Error("Uno de los Cuadros reportados no forma parte de esta actividad.");
  }
  await validarCandadoCuadrosReporte(actividadProgramadaId, input.cuadros);

  if ((await diaEstaCerrado(programada.huertaId, input.fechaReal)) && !input.casoExtraordinario) {
    throw new DiaCerradoRequiereCasoExtraordinarioActividadError();
  }

  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(programada.actividad), config.tarifaGeneralHora);
  const cuadroIdUnico = input.cuadros.length === 1 ? input.cuadros[0]!.cuadroId : undefined;
  const fecha = new Date(input.fechaReal);

  return prisma.$transaction(async (tx) => {
    const realizada = await tx.actividadRealizada.create({
      data: {
        actividadProgramadaId,
        fechaReal: fecha,
        registradoPorId,
        cuadros: { create: input.cuadros.map((c) => ({ cuadroId: c.cuadroId, hectareas: c.hectareas })) },
      },
    });

    await crearPersonasYNomina(tx, realizada.id, programada.huertaId, programada.actividadId, cuadroIdUnico, fecha, input.personas, tarifaAplicada, registradoPorId);

    return tx.actividadRealizada.findUniqueOrThrow({
      where: { id: realizada.id },
      include: { cuadros: { include: { cuadro: true } }, personas: { include: { personal: true } } },
    });
  });
}

export interface EditarAvanceActividadInput {
  cuadros: CuadroAvanceInput[];
  personas: PersonaAvanceInput[];
}

/**
 * Historial de reportes editable por separado (9.4) — sujeto al candado de
 * consistencia con Nómina (bloqueado si la Huerta/fecha del reporte ya
 * tiene el día cerrado) y al mismo candado de superficie por Cuadro.
 * Personas y mano de obra automática se reemplazan completos (borrar y
 * recrear) — mismo criterio que Aplicaciones (9.7).
 */
export async function editarAvanceActividad(realizadaId: string, input: EditarAvanceActividadInput, editadoPorId: string) {
  if (!input.personas || input.personas.length === 0) throw new Error("Falta capturar al menos una persona en este reporte.");
  if (!input.cuadros || input.cuadros.length === 0) throw new Error("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");

  const realizada = await prisma.actividadRealizada.findUniqueOrThrow({
    where: { id: realizadaId },
    include: { actividadProgramada: { include: { cuadros: true, actividad: true } } },
  });
  const fechaISO = realizada.fechaReal.toISOString().slice(0, 10);
  if (await diaEstaCerrado(realizada.actividadProgramada.huertaId, fechaISO)) throw new DiaCerradoActividadError();

  const cuadroIdsProgramados = new Set(realizada.actividadProgramada.cuadros.map((c) => c.cuadroId));
  for (const c of input.cuadros) {
    if (!cuadroIdsProgramados.has(c.cuadroId)) throw new Error("Uno de los Cuadros reportados no forma parte de esta actividad.");
  }
  await validarCandadoCuadrosReporte(realizada.actividadProgramadaId, input.cuadros, realizadaId);

  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(realizada.actividadProgramada.actividad), config.tarifaGeneralHora);
  const cuadroIdUnico = input.cuadros.length === 1 ? input.cuadros[0]!.cuadroId : undefined;

  return prisma.$transaction(async (tx) => {
    await tx.actividadRealizadaCuadro.deleteMany({ where: { realizadaId } });
    await tx.actividadRealizadaCuadro.createMany({
      data: input.cuadros.map((c) => ({ realizadaId, cuadroId: c.cuadroId, hectareas: c.hectareas })),
    });

    await tx.registroNomina.deleteMany({ where: { origen: "automatico_actividad", referenciaOrigenId: realizadaId } });
    await tx.actividadRealizadaPersona.deleteMany({ where: { realizadaId } });

    await crearPersonasYNomina(
      tx,
      realizadaId,
      realizada.actividadProgramada.huertaId,
      realizada.actividadProgramada.actividadId,
      cuadroIdUnico,
      realizada.fechaReal,
      input.personas,
      tarifaAplicada,
      editadoPorId
    );

    return tx.actividadRealizada.findUniqueOrThrow({
      where: { id: realizadaId },
      include: { cuadros: { include: { cuadro: true } }, personas: { include: { personal: true } } },
    });
  });
}
