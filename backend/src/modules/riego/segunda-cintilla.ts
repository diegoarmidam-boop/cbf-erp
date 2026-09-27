import { calcularRepartoAvance, repartirMontoPorHectareas, tarifaEfectiva, type GrupoPrograma } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
import { obtenerVersionVigente } from "../unidades-produccion/cuadros.js";
import { actualizarLineasCintillaTx } from "../unidades-produccion/secciones-riego.js";
import { obtenerConfigNomina } from "../nomina/config.js";
import { aActividadCalc } from "../nomina/util.js";
import { diaEstaCerrado } from "../nomina/captura.js";

/**
 * "Tirar 2da Cintilla" (V1 P5, 27-sep-2026, 9.6) — movida de Actividades:
 * se programa por Sección de Riego (no por Cuadro), porque las líneas de
 * cintilla son una propiedad de la Sección. El avance ya solo indica
 * Sección + hectáreas totales de ese reporte (mismo criterio "no Cuadro" de
 * V1 P2) — el reparto a los Cuadros de esa Sección se calcula y GUARDA al
 * capturar, nunca se recalcula. Sigue usando el catálogo Actividad "Tirar
 * 2da Cintilla" solo para tarifa/costeo (mismo patrón que "Fumigación" en
 * Aplicaciones y "Fertilización" en Granular — ver
 * ACTIVIDADES_RESERVADAS_OTROS_MODULOS en actividades.ts).
 */
export const NOMBRE_ACTIVIDAD_SEGUNDA_CINTILLA = "Tirar 2da Cintilla";

export class DiaCerradoRequiereCasoExtraordinarioSegundaCintillaError extends Error {
  constructor() {
    super(
      "La Huerta ya tiene cerrado el día de Nómina de esta fecha — para que este registro cuente, se necesita autorización de caso extraordinario (Encargado de Nóminas, Director General o Gerente Administrativo)."
    );
  }
}

export class SuperficieExcedeSeccionError extends Error {
  constructor(seccionNombre: string, hectareasProgramadas: number, hectareasAcumuladas: number) {
    super(
      `La Sección "${seccionNombre}" tiene ${hectareasProgramadas} ha programadas, pero entre todos los reportes se acumularían ${hectareasAcumuladas.toFixed(4)} ha — la suma no puede exceder lo programado.`
    );
  }
}

export class SeccionFueraDeProgramacionError extends Error {
  constructor() {
    super("Esa Sección no pertenece a esta programación.");
  }
}

export interface ProgramarSegundaCintillaInput {
  huertaId: string;
  seccionIds: string[];
  fechaInicio: string;
  fechaFin: string;
}

async function hectareasDeSeccion(seccionId: string, fecha: Date): Promise<number> {
  const cuadrosSeccion = await prisma.seccionRiegoCuadro.findMany({ where: { seccionId } });
  let total = 0;
  for (const { cuadroId } of cuadrosSeccion) {
    const version = await obtenerVersionVigente(cuadroId, fecha);
    if (version) total += Number(version.hectareas);
  }
  return total;
}

/** Paso 1, Programar (9.6) — Gerente Técnico de Producción o Asistente Técnico de Producción (validado en la ruta). */
export async function programarSegundaCintilla(input: ProgramarSegundaCintillaInput, creadoPorId: string) {
  if (!input.seccionIds || input.seccionIds.length === 0) throw new Error("Elige al menos una Sección de Riego.");
  const fechaRef = new Date(input.fechaInicio);

  const secciones = await Promise.all(
    input.seccionIds.map(async (seccionId) => ({ seccionId, hectareas: await hectareasDeSeccion(seccionId, fechaRef) }))
  );
  for (const s of secciones) {
    if (s.hectareas <= 0) throw new Error("Una de las Secciones elegidas no tiene Cuadros con una configuración vigente para la fecha de inicio.");
  }

  return prisma.$transaction(async (tx) => {
    const programacion = await tx.segundaCintillaProgramacion.create({
      data: { huertaId: input.huertaId, fechaInicio: fechaRef, fechaFin: new Date(input.fechaFin), creadoPorId },
    });
    await tx.segundaCintillaProgramacionSeccion.createMany({
      data: secciones.map((s) => ({ programacionId: programacion.id, seccionId: s.seccionId, hectareas: s.hectareas })),
    });
    return programacion;
  });
}

const INCLUDE_PROGRAMACION = {
  huerta: true,
  secciones: { include: { seccion: true } },
  realizadas: {
    include: { seccion: true, personas: { include: { personal: true } }, cuadros: { include: { cuadro: true } } },
    orderBy: { fechaReal: "desc" as const },
  },
};

type ProgramacionConRealizadas = {
  id: string;
  secciones: { seccionId: string; hectareas: import("@prisma/client").Prisma.Decimal; seccion: { nombre: string } }[];
  realizadas: { seccionId: string; hectareas: import("@prisma/client").Prisma.Decimal }[];
};

function restantesPorSeccion(programacion: ProgramacionConRealizadas, excluirRealizadaId?: string): Record<string, number> {
  const reportado = new Map<string, number>();
  for (const r of programacion.realizadas) {
    reportado.set(r.seccionId, (reportado.get(r.seccionId) ?? 0) + Number(r.hectareas));
  }
  const restantes: Record<string, number> = {};
  for (const s of programacion.secciones) restantes[s.seccionId] = Math.max(0, Number(s.hectareas) - (reportado.get(s.seccionId) ?? 0));
  return restantes;
}

async function enriquecerConAlertas<T extends ProgramacionConRealizadas>(programacion: T) {
  const hectareasTotalesProgramadas = programacion.secciones.reduce((s, x) => s + Number(x.hectareas), 0);
  const hectareasAvanzadas = programacion.realizadas.reduce((s, r) => s + Number(r.hectareas), 0);
  const porcentajeAvance = hectareasTotalesProgramadas > 0 ? (hectareasAvanzadas / hectareasTotalesProgramadas) * 100 : 0;
  return { ...programacion, hectareasTotalesProgramadas, hectareasAvanzadas, porcentajeAvance, restantesPorSeccion: restantesPorSeccion(programacion) };
}

export async function listarSegundaCintillaProgramadas(huertaId?: string) {
  const items = await prisma.segundaCintillaProgramacion.findMany({ where: { huertaId }, include: INCLUDE_PROGRAMACION, orderBy: { fechaCreacion: "desc" } });
  return Promise.all(items.map(enriquecerConAlertas));
}

export async function obtenerSegundaCintillaProgramada(id: string) {
  const programacion = await prisma.segundaCintillaProgramacion.findUniqueOrThrow({ where: { id }, include: INCLUDE_PROGRAMACION });
  return enriquecerConAlertas(programacion);
}

export interface PersonaSegundaCintillaInput {
  personalId: string;
  horas: number;
}

export interface RegistrarAvanceSegundaCintillaInput {
  seccionId: string;
  fechaReal: string;
  hectareas: number;
  personas: PersonaSegundaCintillaInput[];
  casoExtraordinario?: boolean;
  comentario?: string;
}

function validarPersonas(personas: PersonaSegundaCintillaInput[]) {
  if (!personas || personas.length === 0) throw new Error("Falta capturar al menos una persona en este reporte.");
  for (const p of personas) {
    if (!p.horas || p.horas <= 0) throw new Error("Falta capturar las horas de una persona.");
  }
}

/** Reparto de un reporte a los Cuadros de ESA Sección, proporcional a sus hectáreas — un único "grupo" sintético (sin Grupos de dosis, igual que Actividades). */
async function repartoDeSeccion(seccionId: string, hectareasReporte: number) {
  const cuadrosSeccion = await prisma.seccionRiegoCuadro.findMany({ where: { seccionId } });
  const fechaHoy = new Date();
  const miembros = [];
  for (const { cuadroId } of cuadrosSeccion) {
    const version = await obtenerVersionVigente(cuadroId, fechaHoy);
    if (version) miembros.push({ clave: cuadroId, hectareasProgramadas: Number(version.hectareas) });
  }
  const grupo: GrupoPrograma<string> = { grupoId: "unico", hectareasProgramadas: miembros.reduce((s, m) => s + m.hectareasProgramadas, 0), miembros };
  return calcularRepartoAvance([grupo], hectareasReporte);
}

async function crearNominaSegundaCintilla(
  tx: TransactionClient,
  realizadaId: string,
  huertaId: string,
  fecha: Date,
  hectareasReporte: number,
  personas: PersonaSegundaCintillaInput[],
  reparto: ReturnType<typeof calcularRepartoAvance<string>>,
  actividadId: string,
  tarifaAplicada: number,
  registradoPorId: string
) {
  for (const p of personas) {
    const horasPorMiembro = repartirMontoPorHectareas(reparto.porMiembro, hectareasReporte, p.horas);
    for (const hm of horasPorMiembro) {
      if (hm.monto <= 0.0001) continue;
      await tx.registroNomina.create({
        data: {
          fecha,
          huertaId,
          cuadroId: hm.clave,
          personalId: p.personalId,
          actividadId,
          cantidad: hm.monto,
          tarifaAplicada,
          origen: "automatico_segunda_cintilla",
          referenciaOrigenId: realizadaId,
          capturadoPorId: registradoPorId,
        },
      });
    }
  }
}

/** Si la Sección llega al 100% de sus hectáreas programadas, abre "líneas de cintilla = 2" con la fecha de este reporte (9.6c) — no abre versión si ya está en 2 ni si hay una versión posterior. */
async function aplicarSegundaCintillaSiCompleta(tx: TransactionClient, seccionId: string, hectareasProgramadas: number, hectareasAvanzadasTotal: number, fechaReal: string) {
  if (hectareasAvanzadasTotal + 0.0001 < hectareasProgramadas) return;
  const fecha = new Date(fechaReal);
  const vigente = await tx.seccionRiegoLineasCintilla.findFirst({
    where: { seccionId, vigenteDesde: { lte: fecha }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fecha } }] },
  });
  if (vigente?.lineas === 2) return;
  const posterior = await tx.seccionRiegoLineasCintilla.findFirst({ where: { seccionId, vigenteDesde: { gt: fecha } } });
  if (posterior) return;
  await actualizarLineasCintillaTx(tx, seccionId, 2, fechaReal);
}

/** Paso 2, Registrar avance (9.6) — Supervisor de Huerta o Capturista de Información (validado en la ruta). */
export async function registrarAvanceSegundaCintilla(programacionId: string, input: RegistrarAvanceSegundaCintillaInput, registradoPorId: string) {
  if (!input.hectareas || input.hectareas <= 0) throw new Error("Captura las hectáreas avanzadas en este reporte.");
  validarPersonas(input.personas);

  const programacion = await prisma.segundaCintillaProgramacion.findUniqueOrThrow({
    where: { id: programacionId },
    include: { secciones: { include: { seccion: true } }, realizadas: { select: { seccionId: true, hectareas: true } } },
  });
  const seccionProgramada = programacion.secciones.find((s) => s.seccionId === input.seccionId);
  if (!seccionProgramada) throw new SeccionFueraDeProgramacionError();

  const yaReportadas = programacion.realizadas.filter((r) => r.seccionId === input.seccionId).reduce((s, r) => s + Number(r.hectareas), 0);
  const totalConEste = yaReportadas + input.hectareas;
  if (totalConEste > Number(seccionProgramada.hectareas) + 0.0001) {
    throw new SuperficieExcedeSeccionError(seccionProgramada.seccion.nombre, Number(seccionProgramada.hectareas), totalConEste);
  }

  if ((await diaEstaCerrado(programacion.huertaId, input.fechaReal)) && !input.casoExtraordinario) {
    throw new DiaCerradoRequiereCasoExtraordinarioSegundaCintillaError();
  }

  const actividad = await prisma.actividad.findFirstOrThrow({ where: { nombre: NOMBRE_ACTIVIDAD_SEGUNDA_CINTILLA } });
  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
  const fecha = new Date(input.fechaReal);
  const reparto = await repartoDeSeccion(input.seccionId, input.hectareas);

  return prisma.$transaction(async (tx) => {
    const realizada = await tx.segundaCintillaRealizada.create({
      data: { programacionId, seccionId: input.seccionId, fechaReal: fecha, hectareas: input.hectareas, registradoPorId, comentario: input.comentario },
    });

    await tx.segundaCintillaRealizadaPersona.createMany({
      data: input.personas.map((p) => ({ realizadaId: realizada.id, personalId: p.personalId, horas: p.horas })),
    });
    await tx.segundaCintillaRealizadaCuadro.createMany({
      data: reparto.porMiembro.map((m) => ({ realizadaId: realizada.id, cuadroId: m.clave, hectareasAtribuidas: m.hectareasAtribuidas })),
    });

    await crearNominaSegundaCintilla(tx, realizada.id, programacion.huertaId, fecha, input.hectareas, input.personas, reparto, actividad.id, tarifaAplicada, registradoPorId);
    await aplicarSegundaCintillaSiCompleta(tx, input.seccionId, Number(seccionProgramada.hectareas), totalConEste, input.fechaReal);

    return tx.segundaCintillaRealizada.findUniqueOrThrow({
      where: { id: realizada.id },
      include: { seccion: true, personas: { include: { personal: true } }, cuadros: { include: { cuadro: true } } },
    });
  });
}

export interface EditarAvanceSegundaCintillaInput {
  hectareas: number;
  personas: PersonaSegundaCintillaInput[];
  comentario?: string;
}

export class DiaCerradoSegundaCintillaError extends Error {
  constructor() {
    super("La Huerta ya tiene cerrado el día de Nómina de este reporte — no se puede editar (candado de consistencia con Nómina).");
  }
}

/** Historial de reportes editable por separado — mismo candado de consistencia con Nómina que Actividades/Aplicaciones. */
export async function editarAvanceSegundaCintilla(realizadaId: string, input: EditarAvanceSegundaCintillaInput, editadoPorId: string) {
  if (!input.hectareas || input.hectareas <= 0) throw new Error("Captura las hectáreas avanzadas en este reporte.");
  validarPersonas(input.personas);

  const realizada = await prisma.segundaCintillaRealizada.findUniqueOrThrow({
    where: { id: realizadaId },
    include: {
      programacion: { include: { secciones: { include: { seccion: true } }, realizadas: { select: { id: true, seccionId: true, hectareas: true } } } },
    },
  });
  const fechaISO = realizada.fechaReal.toISOString().slice(0, 10);
  if (await diaEstaCerrado(realizada.programacion.huertaId, fechaISO)) throw new DiaCerradoSegundaCintillaError();

  const programacion = realizada.programacion;
  const seccionProgramada = programacion.secciones.find((s) => s.seccionId === realizada.seccionId)!;
  const yaReportadasOtras = programacion.realizadas
    .filter((r) => r.id !== realizadaId && r.seccionId === realizada.seccionId)
    .reduce((s, r) => s + Number(r.hectareas), 0);
  const totalConEste = yaReportadasOtras + input.hectareas;
  if (totalConEste > Number(seccionProgramada.hectareas) + 0.0001) {
    throw new SuperficieExcedeSeccionError(seccionProgramada.seccion.nombre, Number(seccionProgramada.hectareas), totalConEste);
  }

  const actividad = await prisma.actividad.findFirstOrThrow({ where: { nombre: NOMBRE_ACTIVIDAD_SEGUNDA_CINTILLA } });
  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
  const reparto = await repartoDeSeccion(realizada.seccionId, input.hectareas);

  return prisma.$transaction(async (tx) => {
    await tx.segundaCintillaRealizadaPersona.deleteMany({ where: { realizadaId } });
    await tx.segundaCintillaRealizadaCuadro.deleteMany({ where: { realizadaId } });
    await tx.registroNomina.deleteMany({ where: { origen: "automatico_segunda_cintilla", referenciaOrigenId: realizadaId } });

    await tx.segundaCintillaRealizada.update({ where: { id: realizadaId }, data: { hectareas: input.hectareas, comentario: input.comentario } });
    await tx.segundaCintillaRealizadaPersona.createMany({
      data: input.personas.map((p) => ({ realizadaId, personalId: p.personalId, horas: p.horas })),
    });
    await tx.segundaCintillaRealizadaCuadro.createMany({
      data: reparto.porMiembro.map((m) => ({ realizadaId, cuadroId: m.clave, hectareasAtribuidas: m.hectareasAtribuidas })),
    });
    await crearNominaSegundaCintilla(tx, realizadaId, programacion.huertaId, realizada.fechaReal, input.hectareas, input.personas, reparto, actividad.id, tarifaAplicada, editadoPorId);
    await aplicarSegundaCintillaSiCompleta(tx, realizada.seccionId, Number(seccionProgramada.hectareas), totalConEste, fechaISO);

    return tx.segundaCintillaRealizada.findUniqueOrThrow({
      where: { id: realizadaId },
      include: { seccion: true, personas: { include: { personal: true } }, cuadros: { include: { cuadro: true } } },
    });
  });
}
