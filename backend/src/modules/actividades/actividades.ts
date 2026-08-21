import { tarifaEfectiva, TarifaGeneralNoConfiguradaError } from "@cbf/shared";
import type { Prisma, TipoRecursoActividad } from "@prisma/client";
import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
import { obtenerVersionVigente } from "../unidades-produccion/cuadros.js";
import { obtenerConfigNomina } from "../nomina/config.js";
import { aActividadCalc } from "../nomina/util.js";
import { diaEstaCerrado } from "../nomina/captura.js";
import { registrarUsoDiarioAutomaticoTx, borrarUsoDiarioDeLineasTx } from "../equipos/uso-diario.js";
import { listarEquipos } from "../equipos/equipos.js";
import { comunicacionActiva } from "../../core/moduloComunicacion.js";

/**
 * Corrección de fondo (9.4, 15-ago-2026): el alcance inicial del módulo
 * (10-ago-2026) se implementó como una lista fija de 7 nombres permitidos —
 * eso funcionaba mientras el catálogo era cerrado, pero desde que se abrió
 * con botón "+" (ver catalogo.routes.ts), cualquier actividad nueva que
 * Diego dé de alta (ej. "Bordeo", "Encamado") nunca aparecería para
 * programar sin que alguien edite código y despliegue de nuevo — eso era el
 * bug real detrás de "actividades ya dadas de alta que no aparecen al
 * programar" (no era la etapa restringida: ese campo existe en el esquema
 * pero no se usa en ningún lado del código todavía).
 *
 * Se invierte el criterio: en vez de una lista blanca de lo permitido, una
 * lista negra corta de lo que NO debe programarse aquí — solo los dos
 * nombres que otros módulos usan como ancla fija para su propia mano de
 * obra automática (NOMBRE_ACTIVIDAD_APLICACION en aplicaciones.ts,
 * NOMBRE_ACTIVIDAD_GRANULAR en fertilizantes/granular.ts) — programarlas
 * aquí también generaría un registro paralelo y confuso, sin relación con
 * el flujo real de Aplicaciones/Fertilizantes. Todo lo demás del catálogo
 * (incluida cualquier actividad nueva) es programable de inmediato.
 */
export const ACTIVIDADES_RESERVADAS_OTROS_MODULOS = ["Fumigación", "Fertilización"];

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

/** Implementos elegibles en una línea de Tractor/Mixta (9.4/9.13, 15-ago-2026). */
export function equiposImplementoParaActividad() {
  return listarEquipos("implemento");
}

/** Tractores elegibles en una línea de Tractor/Mixta (9.4/9.13, 15-ago-2026). */
export function equiposTractorParaActividad() {
  return listarEquipos("tractor");
}

/** Catálogo de actividades elegibles al programar (9.4) — todo el catálogo activo, salvo lo reservado por otros módulos. */
export function actividadesParaProgramar() {
  return prisma.actividad.findMany({
    where: { nombre: { notIn: ACTIVIDADES_RESERVADAS_OTROS_MODULOS }, activo: true },
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
  if (ACTIVIDADES_RESERVADAS_OTROS_MODULOS.includes(actividad.nombre)) {
    throw new ActividadFueraDeAlcanceError();
  }
  // Corrección de mensaje (15-ago-2026): antes esta falta solo se detectaba
  // hasta Registrar avance (Paso 2) o, peor, al listar (ver
  // enriquecerConAlertas), donde terminaba mostrando el mensaje del Cuadro
  // por casualidad de orden — se valida aquí, temprano y explícito, para
  // que el bloqueo real en Programar (Paso 1) diga la causa real.
  if (actividad.usarTarifaGeneral) {
    const config = await obtenerConfigNomina();
    tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
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

const INCLUDE_LINEA_ACTIVIDAD = { tractor: true, operador: true, implemento: true, personas: { include: { personal: true } } };

const INCLUDE_ACTIVIDAD_PROGRAMADA = {
  huerta: true,
  actividad: true,
  cuadros: { include: { cuadro: true } },
  realizadas: {
    include: { cuadros: { include: { cuadro: true } }, lineas: { include: INCLUDE_LINEA_ACTIVIDAD } },
    orderBy: { fechaReal: "desc" as const },
  },
};

type ActividadProgramadaConRealizadas = {
  id: string;
  actividad: { tarifa: unknown; usarTarifaGeneral: boolean };
  hectareasTotalesProgramadas: Prisma.Decimal;
  cuadros: { cuadroId: string; cuadro: { nombre: string } }[];
  realizadas: {
    id: string;
    cuadros: { cuadroId: string; hectareas: Prisma.Decimal }[];
    lineas: { operadorHoras: Prisma.Decimal | null; personas: { horas: Prisma.Decimal }[] }[];
  }[];
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
  const horasHombreTotales = programada.realizadas.reduce(
    (s, r) =>
      s + r.lineas.reduce((s2, l) => s2 + Number(l.operadorHoras ?? 0) + l.personas.reduce((s3, p) => s3 + Number(p.horas), 0), 0),
    0
  );
  const porcentajeAvance = Number(programada.hectareasTotalesProgramadas) > 0 ? (hectareasAvanzadas / Number(programada.hectareasTotalesProgramadas)) * 100 : 0;
  const restantesPorCuadro = await hectareasRestantesPorCuadro(programada);
  // Nunca debe tronar la lista completa por una sola Actividad sin tarifa
  // general configurada (15-ago-2026) — antes `tarifaEfectiva` sin proteger
  // aquí podía romper el listado entero con un error 500 genérico, en vez
  // de solo avisar en el punto donde de verdad hace falta el monto
  // (Programar y Registrar avance, que sí la exigen).
  let costoTotal: number | null = null;
  try {
    costoTotal = horasHombreTotales * tarifaEfectiva(aActividadCalc(programada.actividad), tarifaGeneralHora);
  } catch (err) {
    if (!(err instanceof TarifaGeneralNoConfiguradaError)) throw err;
  }

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

export interface PersonaLineaActividadInput {
  personalId: string;
  horas: number;
}

/**
 * Línea de recurso de un reporte (9.4, 15-ago-2026, reabre decisión previa
 * del 11-ago que dejaba a Actividades sin maquinaria) — mismo patrón que
 * Aplicaciones (9.7): tipo "tractor" exige Tractor+Operador+Implemento,
 * "mixta" lo mismo más una lista de personas propia, "gente" solo la lista
 * de personas. A diferencia de Aplicaciones, las horas se capturan por
 * persona (`personas[].horas` y `operadorHoras` por separado) — confirmado
 * con Diego para no perder la flexibilidad que ya tenía este módulo de que
 * cada quien trabaje horas distintas el mismo reporte.
 */
export interface LineaActividadInput {
  tipo: TipoRecursoActividad;
  tractorId?: string;
  operadorId?: string;
  operadorHoras?: number;
  implementoId?: string;
  personas: PersonaLineaActividadInput[];
}

export interface RegistrarAvanceActividadInput {
  fechaReal: string;
  cuadros: CuadroAvanceInput[];
  lineas: LineaActividadInput[];
  casoExtraordinario?: boolean;
}

/** Validación de forma de las líneas — mismo criterio que Aplicaciones (9.7), adaptado a los 3 tipos de Actividades. */
function validarLineasActividad(lineas: LineaActividadInput[], tipoRecursoActividad: TipoRecursoActividad) {
  if (!lineas || lineas.length === 0) {
    throw new Error("Falta capturar al menos una línea de recurso (Gente, Tractor o Mixta) en este reporte.");
  }
  for (const l of lineas) {
    if (tipoRecursoActividad !== "mixta" && l.tipo !== tipoRecursoActividad) {
      throw new Error(`Esta actividad solo admite líneas de tipo "${tipoRecursoActividad}".`);
    }
    if (l.tipo === "gente") {
      if (l.tractorId || l.operadorId || l.implementoId) throw new Error("Una línea de Gente no lleva tractor ni implemento.");
      if (!l.personas || l.personas.length === 0) throw new Error("Una línea de Gente necesita al menos una persona.");
    } else {
      if (!l.tractorId || !l.operadorId || !l.implementoId) {
        throw new Error(`Una línea de ${l.tipo === "tractor" ? "Tractor" : "Mixta"} necesita Tractor, Operador e Implemento.`);
      }
      if (!l.operadorHoras || l.operadorHoras <= 0) throw new Error("Falta capturar las horas del operador de una línea.");
      if (l.tipo === "tractor" && l.personas && l.personas.length > 0) throw new Error("Una línea de Tractor no lleva gente extra.");
      if (l.tipo === "mixta" && (!l.personas || l.personas.length === 0)) throw new Error("Una línea de Mixta necesita al menos una persona además del operador.");
    }
    for (const p of l.personas ?? []) {
      if (!p.horas || p.horas <= 0) throw new Error("Falta capturar las horas de una persona.");
    }
  }
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

/** Crea las líneas de un reporte + su mano de obra automática + su alimentación a Uso Diario — compartido entre crear y editar (mismo patrón que Aplicaciones 9.7). */
async function crearLineasYNomina(
  tx: TransactionClient,
  realizadaId: string,
  huertaId: string,
  actividadId: string,
  cuadroIdUnico: string | undefined,
  fecha: Date,
  lineas: LineaActividadInput[],
  tarifaAplicada: number,
  registradoPorId: string
) {
  // Switch de comunicación por módulo (20-ago-2026): con "actividades"
  // apagado, el reporte de avance se sigue guardando igual (Cuadros,
  // líneas, quién y cuántas horas) — solo se detienen las cascadas hacia
  // Nómina y Uso Diario de Equipos. La mano de obra y el uso de tractor
  // quedan abiertos para capturarse a mano en esos módulos, con la misma
  // estructura de siempre.
  const cascadaActiva = await comunicacionActiva("actividades");

  async function pagar(personalId: string, horas: number) {
    if (!cascadaActiva) return;
    await tx.registroNomina.create({
      data: {
        fecha,
        huertaId,
        cuadroId: cuadroIdUnico,
        personalId,
        actividadId,
        cantidad: horas,
        tarifaAplicada,
        origen: "automatico_actividad",
        referenciaOrigenId: realizadaId,
        capturadoPorId: registradoPorId,
      },
    });
  }

  for (const l of lineas) {
    const lineaCreada = await tx.actividadRealizadaLinea.create({
      data: {
        realizadaId,
        tipo: l.tipo,
        tractorId: l.tractorId,
        operadorId: l.operadorId,
        operadorHoras: l.operadorHoras,
        implementoId: l.implementoId,
        personas: { create: l.personas.map((p) => ({ personalId: p.personalId, horas: p.horas })) },
      },
    });

    if (l.tipo !== "gente" && l.operadorId && l.operadorHoras) {
      await pagar(l.operadorId, l.operadorHoras);
      if (cascadaActiva) {
        await registrarUsoDiarioAutomaticoTx(tx, l.tractorId!, fecha, l.operadorId, l.operadorHoras, huertaId, lineaCreada.id, "automatico_actividad");
      }
    }
    for (const p of l.personas) {
      await pagar(p.personalId, p.horas);
    }
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
  if (!input.cuadros || input.cuadros.length === 0) throw new Error("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");

  const programada = await prisma.actividadProgramada.findUniqueOrThrow({
    where: { id: actividadProgramadaId },
    include: { cuadros: true, actividad: true },
  });
  validarLineasActividad(input.lineas, programada.actividad.tipoRecurso);
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

    await crearLineasYNomina(tx, realizada.id, programada.huertaId, programada.actividadId, cuadroIdUnico, fecha, input.lineas, tarifaAplicada, registradoPorId);

    return tx.actividadRealizada.findUniqueOrThrow({
      where: { id: realizada.id },
      include: { cuadros: { include: { cuadro: true } }, lineas: { include: INCLUDE_LINEA_ACTIVIDAD } },
    });
  });
}

export interface EditarAvanceActividadInput {
  cuadros: CuadroAvanceInput[];
  lineas: LineaActividadInput[];
}

/**
 * Historial de reportes editable por separado (9.4) — sujeto al candado de
 * consistencia con Nómina (bloqueado si la Huerta/fecha del reporte ya
 * tiene el día cerrado) y al mismo candado de superficie por Cuadro.
 * Líneas, Uso Diario automático y mano de obra automática se reemplazan
 * completos (borrar y recrear) — mismo criterio que Aplicaciones (9.7).
 */
export async function editarAvanceActividad(realizadaId: string, input: EditarAvanceActividadInput, editadoPorId: string) {
  if (!input.cuadros || input.cuadros.length === 0) throw new Error("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");

  const realizada = await prisma.actividadRealizada.findUniqueOrThrow({
    where: { id: realizadaId },
    include: { actividadProgramada: { include: { cuadros: true, actividad: true } }, lineas: true },
  });
  validarLineasActividad(input.lineas, realizada.actividadProgramada.actividad.tipoRecurso);
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
  const lineaIdsAnteriores = realizada.lineas.map((l) => l.id);

  return prisma.$transaction(async (tx) => {
    await tx.actividadRealizadaCuadro.deleteMany({ where: { realizadaId } });
    await tx.actividadRealizadaCuadro.createMany({
      data: input.cuadros.map((c) => ({ realizadaId, cuadroId: c.cuadroId, hectareas: c.hectareas })),
    });

    await borrarUsoDiarioDeLineasTx(tx, lineaIdsAnteriores);
    await tx.registroNomina.deleteMany({ where: { origen: "automatico_actividad", referenciaOrigenId: realizadaId } });
    await tx.actividadRealizadaLineaPersona.deleteMany({ where: { lineaId: { in: lineaIdsAnteriores } } });
    await tx.actividadRealizadaLinea.deleteMany({ where: { realizadaId } });

    await crearLineasYNomina(
      tx,
      realizadaId,
      realizada.actividadProgramada.huertaId,
      realizada.actividadProgramada.actividadId,
      cuadroIdUnico,
      realizada.fechaReal,
      input.lineas,
      tarifaAplicada,
      editadoPorId
    );

    return tx.actividadRealizada.findUniqueOrThrow({
      where: { id: realizadaId },
      include: { cuadros: { include: { cuadro: true } }, lineas: { include: INCLUDE_LINEA_ACTIVIDAD } },
    });
  });
}
