import { calcularRepartoAvance, ordenarPorNombreNumerico, repartirMontoPorHectareas, tarifaEfectiva, TarifaGeneralNoConfiguradaError, type GrupoPrograma } from "@cbf/shared";
import type { Prisma, TipoRecursoActividad } from "@prisma/client";
import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
import { obtenerVersionVigente } from "../unidades-produccion/cuadros.js";
import { actualizarLineasCintillaTx } from "../unidades-produccion/secciones-riego.js";
import { obtenerConfigNomina } from "../nomina/config.js";
import { aActividadCalc } from "../nomina/util.js";
import { diaEstaCerrado } from "../nomina/captura.js";
import { registrarUsoDiarioAutomaticoTx, borrarUsoDiarioDeLineasTx } from "../equipos/uso-diario.js";
import { listarEquipos } from "../equipos/equipos.js";
import { comunicacionActiva } from "../../core/moduloComunicacion.js";

/**
 * Corrección de fondo (9.4, 15-ago-2026): lista negra corta de lo que NO
 * debe programarse aquí — solo los dos nombres que otros módulos usan como
 * ancla fija para su propia mano de obra automática.
 */
export const ACTIVIDADES_RESERVADAS_OTROS_MODULOS = ["Fumigación", "Fertilización"];

export class ActividadFueraDeAlcanceError extends Error {
  constructor() {
    super("Esta actividad todavía no está cubierta por este módulo — se sigue capturando directo en Nómina.");
  }
}

export class SuperficieExcedeProgramadoError extends Error {
  constructor(hectareasProgramadas: number, hectareasAcumuladas: number) {
    super(
      `Esta Actividad tiene ${hectareasProgramadas} ha programadas, pero entre todos los reportes se acumularían ${hectareasAcumuladas.toFixed(4)} ha — la suma no puede exceder lo programado.`
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

export type ModoProgramacionCuadro = "por_cuadro" | "por_variedad";

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

/** Codifica un miembro (Cuadro o Cuadro+Variedad) como clave única. */
function claveMiembro(cuadroId: string, variedad: string | null): string {
  return variedad ? `${cuadroId}::${variedad}` : cuadroId;
}
function parseClaveMiembro(clave: string): { cuadroId: string; variedad: string | null } {
  const idx = clave.indexOf("::");
  return idx === -1 ? { cuadroId: clave, variedad: null } : { cuadroId: clave.slice(0, idx), variedad: clave.slice(idx + 2) };
}

/** Hectáreas de una variedad en un Cuadro según la composición varietal vigente del Ciclo. */
async function hectareasDeVariedad(huertaId: string, cuadroId: string, variedad: string, fechaRef: Date): Promise<number> {
  const ciclo = await prisma.ciclo.findFirst({ where: { huertaId, activo: true }, include: { variedades: true } });
  const fila = ciclo?.variedades.find((v) => v.cuadroId === cuadroId && v.variedad === variedad);
  if (!fila) throw new Error(`No se encontró la variedad "${variedad}" en el Cuadro elegido, dentro del Ciclo activo de esta Huerta.`);
  if (fila.hectareas != null) return Number(fila.hectareas);
  if (fila.porcentaje != null) {
    const version = await obtenerVersionVigente(cuadroId, fechaRef);
    if (!version) throw new Error("El Cuadro elegido no tiene una configuración vigente para la fecha de inicio.");
    return (Number(fila.porcentaje) / 100) * Number(version.hectareas);
  }
  throw new Error(`La variedad "${variedad}" del Cuadro elegido no tiene hectáreas ni porcentaje capturados en el Ciclo.`);
}

export interface CuadroInput {
  cuadroId: string;
  hectareas: number;
}
export interface VariedadInput {
  cuadroId: string;
  variedad: string;
}

export interface ProgramarActividadInput {
  huertaId: string;
  modo: ModoProgramacionCuadro;
  cuadros?: CuadroInput[]; // modo por_cuadro
  variedades?: VariedadInput[]; // modo por_variedad
  actividadId: string;
  comentario?: string;
  fechaInicio: string;
  fechaFin: string;
}

interface MiembroResuelto {
  cuadroId: string;
  variedad: string | null;
  hectareas: number;
}

async function resolverMiembros(huertaId: string, modo: ModoProgramacionCuadro, input: { cuadros?: CuadroInput[]; variedades?: VariedadInput[] }, fechaRef: Date): Promise<MiembroResuelto[]> {
  if (modo === "por_cuadro") {
    if (!input.cuadros || input.cuadros.length === 0) throw new Error("Elige al menos un Cuadro.");
    const miembros: MiembroResuelto[] = [];
    for (const c of input.cuadros) {
      const version = await obtenerVersionVigente(c.cuadroId, fechaRef);
      if (!version) throw new Error("Uno de los Cuadros elegidos no tiene una configuración vigente para la fecha de inicio.");
      if (c.hectareas <= 0 || c.hectareas > Number(version.hectareas) + 0.0001) {
        throw new Error(`Hectáreas inválidas para uno de los Cuadros: no pueden ser 0 ni exceder su superficie (${version.hectareas} ha).`);
      }
      miembros.push({ cuadroId: c.cuadroId, variedad: null, hectareas: c.hectareas });
    }
    return miembros;
  }
  if (!input.variedades || input.variedades.length === 0) throw new Error("Elige al menos una Variedad.");
  return Promise.all(
    input.variedades.map(async (v) => ({ cuadroId: v.cuadroId, variedad: v.variedad, hectareas: await hectareasDeVariedad(huertaId, v.cuadroId, v.variedad, fechaRef) }))
  );
}

/** Paso 1, Programar (9.4, V1 P2 25-sep-2026: modo Por Cuadro/Por Variedad, sin Grupos) — sin gate de Almacén. */
export async function programarActividad(input: ProgramarActividadInput, creadoPorId: string) {
  const actividad = await prisma.actividad.findUniqueOrThrow({ where: { id: input.actividadId } });
  if (ACTIVIDADES_RESERVADAS_OTROS_MODULOS.includes(actividad.nombre)) {
    throw new ActividadFueraDeAlcanceError();
  }
  if (actividad.usarTarifaGeneral) {
    const config = await obtenerConfigNomina();
    tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
  }

  const fechaRef = new Date(input.fechaInicio);
  const miembros = await resolverMiembros(input.huertaId, input.modo, input, fechaRef);
  const hectareasTotales = miembros.reduce((s, m) => s + m.hectareas, 0);

  return prisma.$transaction(async (tx) => {
    const programada = await tx.actividadProgramada.create({
      data: {
        huertaId: input.huertaId,
        actividadId: input.actividadId,
        modo: input.modo,
        comentario: input.comentario,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        hectareasTotalesProgramadas: hectareasTotales,
        creadoPorId,
      },
    });
    if (input.modo === "por_cuadro") {
      await tx.actividadProgramadaCuadro.createMany({
        data: miembros.map((m) => ({ actividadProgramadaId: programada.id, cuadroId: m.cuadroId, hectareas: m.hectareas })),
      });
    } else {
      await tx.actividadProgramadaVariedad.createMany({
        data: miembros.map((m) => ({ actividadProgramadaId: programada.id, cuadroId: m.cuadroId, variedad: m.variedad!, hectareas: m.hectareas })),
      });
    }
    return programada;
  });
}

const INCLUDE_LINEA_ACTIVIDAD = { tractor: true, operador: true, implemento: true, personas: { include: { personal: true } } };

const INCLUDE_ACTIVIDAD_PROGRAMADA = {
  huerta: true,
  actividad: true,
  cuadros: { include: { cuadro: true } },
  variedades: { include: { cuadro: true } },
  realizadas: {
    include: { cuadros: { include: { cuadro: true } }, lineas: { include: INCLUDE_LINEA_ACTIVIDAD } },
    orderBy: { fechaReal: "desc" as const },
  },
};

type ActividadProgramadaConRealizadas = {
  id: string;
  huertaId: string;
  actividad: { nombre: string; tarifa: unknown; usarTarifaGeneral: boolean };
  hectareasTotalesProgramadas: Prisma.Decimal;
  cuadros: { cuadroId: string; hectareas: Prisma.Decimal; cuadro: { nombre: string } }[];
  variedades: { cuadroId: string; variedad: string; hectareas: Prisma.Decimal }[];
  realizadas: {
    id: string;
    hectareas: Prisma.Decimal;
    cuadros: { cuadroId: string; variedad: string | null; hectareasAtribuidas: Prisma.Decimal }[];
    lineas: { operadorHoras: Prisma.Decimal | null; personas: { horas: Prisma.Decimal }[] }[];
  }[];
};

interface ProgramadaParaReparto {
  cuadros: { cuadroId: string; hectareas: Prisma.Decimal }[];
  variedades: { cuadroId: string; variedad: string; hectareas: Prisma.Decimal }[];
}

function gruposParaReparto(programada: ProgramadaParaReparto): GrupoPrograma<string>[] {
  // Sin Grupos en Actividades (regla explícita) — un único Grupo sintético con todos los miembros.
  const miembros =
    programada.cuadros.length > 0
      ? programada.cuadros.map((c) => ({ clave: claveMiembro(c.cuadroId, null), hectareasProgramadas: Number(c.hectareas) }))
      : programada.variedades.map((v) => ({ clave: claveMiembro(v.cuadroId, v.variedad), hectareasProgramadas: Number(v.hectareas) }));
  return [{ grupoId: "unico", hectareasProgramadas: miembros.reduce((s, m) => s + m.hectareasProgramadas, 0), miembros }];
}

/** Hectáreas restantes por miembro (Cuadro/Variedad) — mismo criterio que Aplicaciones. */
function hectareasRestantesPorMiembro(programada: ActividadProgramadaConRealizadas, excluirRealizadaId?: string): Record<string, number> {
  const programadoPorClave = new Map<string, number>();
  if (programada.cuadros.length > 0) {
    for (const c of programada.cuadros) programadoPorClave.set(claveMiembro(c.cuadroId, null), Number(c.hectareas));
  } else {
    for (const v of programada.variedades) programadoPorClave.set(claveMiembro(v.cuadroId, v.variedad), Number(v.hectareas));
  }
  const reportadoPorClave = new Map<string, number>();
  for (const r of programada.realizadas) {
    if (r.id === excluirRealizadaId) continue;
    for (const c of r.cuadros) {
      const clave = claveMiembro(c.cuadroId, c.variedad);
      reportadoPorClave.set(clave, (reportadoPorClave.get(clave) ?? 0) + Number(c.hectareasAtribuidas));
    }
  }
  const restantes: Record<string, number> = {};
  for (const [clave, total] of programadoPorClave) restantes[clave] = Math.max(0, total - (reportadoPorClave.get(clave) ?? 0));
  return restantes;
}

async function enriquecerConAlertas<T extends ActividadProgramadaConRealizadas>(programada: T, tarifaGeneralHora: number | null) {
  const hectareasAvanzadas = programada.realizadas.reduce((s, r) => s + Number(r.hectareas), 0);
  const horasHombreTotales = programada.realizadas.reduce(
    (s, r) => s + r.lineas.reduce((s2, l) => s2 + Number(l.operadorHoras ?? 0) + l.personas.reduce((s3, p) => s3 + Number(p.horas), 0), 0),
    0
  );
  const porcentajeAvance = Number(programada.hectareasTotalesProgramadas) > 0 ? (hectareasAvanzadas / Number(programada.hectareasTotalesProgramadas)) * 100 : 0;
  const restantesPorMiembro = hectareasRestantesPorMiembro(programada);
  // Nunca debe tronar la lista completa por una sola Actividad sin tarifa general configurada.
  let costoTotal: number | null = null;
  try {
    costoTotal = horasHombreTotales * tarifaEfectiva(aActividadCalc(programada.actividad), tarifaGeneralHora);
  } catch (err) {
    if (!(err instanceof TarifaGeneralNoConfiguradaError)) throw err;
  }

  return { ...programada, hectareasAvanzadas, horasHombreTotales, porcentajeAvance, restantesPorMiembro, costoTotal };
}

/** 9.15 (31-ago-2026): Cuadros en orden numérico, no alfabético. */
function ordenarCuadrosDe<T extends { cuadros: { cuadro: { nombre: string } }[] }>(item: T): T {
  item.cuadros = ordenarPorNombreNumerico(item.cuadros, (c) => c.cuadro.nombre);
  return item;
}

export async function listarActividadesProgramadas(huertaId?: string) {
  const config = await obtenerConfigNomina();
  const items = await prisma.actividadProgramada.findMany({
    where: { huertaId },
    include: INCLUDE_ACTIVIDAD_PROGRAMADA,
    orderBy: { fechaCreacion: "desc" },
  });
  items.forEach(ordenarCuadrosDe);
  return Promise.all(items.map((a) => enriquecerConAlertas(a, config.tarifaGeneralHora)));
}

export async function obtenerActividadProgramada(id: string) {
  const config = await obtenerConfigNomina();
  const programada = await prisma.actividadProgramada.findUniqueOrThrow({ where: { id }, include: INCLUDE_ACTIVIDAD_PROGRAMADA });
  ordenarCuadrosDe(programada);
  return enriquecerConAlertas(programada, config.tarifaGeneralHora);
}

export interface PersonaLineaActividadInput {
  personalId: string;
  horas: number;
}

/**
 * Línea de recurso de un reporte (9.4, 15-ago-2026) — mismo patrón que
 * Aplicaciones (9.7): tipo "tractor" exige Tractor+Operador+Implemento,
 * "mixta" lo mismo más una lista de personas propia, "gente" solo la lista
 * de personas. Las horas se capturan por persona.
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
  // V1 P2, 25-sep-2026: el avance ya NO indica Cuadro/Variedad — solo hectáreas totales de este reporte.
  hectareas: number;
  lineas: LineaActividadInput[];
  casoExtraordinario?: boolean;
  comentario?: string;
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
 * Crea las líneas de un reporte + su mano de obra automática + su
 * alimentación a Uso Diario (V1 P2, 25-sep-2026: las horas de CADA persona
 * — y del operador — se reparten entre los miembros atribuidos, en vez de
 * ir todas a un único Cuadro).
 */
async function crearLineasYNomina(
  tx: TransactionClient,
  realizadaId: string,
  huertaId: string,
  actividadId: string,
  fecha: Date,
  hectareasReporte: number,
  lineas: LineaActividadInput[],
  reparto: ReturnType<typeof calcularRepartoAvance<string>>,
  tarifaAplicada: number,
  registradoPorId: string
) {
  const cascadaActiva = await comunicacionActiva("actividades");

  async function pagar(personalId: string, horas: number) {
    if (!cascadaActiva || horas <= 0.0001) return;
    const horasPorMiembro = repartirMontoPorHectareas(reparto.porMiembro, hectareasReporte, horas);
    for (const hm of horasPorMiembro) {
      if (hm.monto <= 0.0001) continue;
      const { cuadroId } = parseClaveMiembro(hm.clave);
      await tx.registroNomina.create({
        data: {
          fecha,
          huertaId,
          cuadroId,
          personalId,
          actividadId,
          cantidad: hm.monto,
          tarifaAplicada,
          origen: "automatico_actividad",
          referenciaOrigenId: realizadaId,
          capturadoPorId: registradoPorId,
        },
      });
    }
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
 * Paso 2, Registrar avance (9.4, V1 P2 25-sep-2026): ya no indica Cuadro/
 * Variedad — solo hectáreas totales del reporte. Se reparte a Cuadros/
 * Variedades en proporción a lo programado y se GUARDA calculado (nunca se
 * recalcula después). Genera mano de obra automática en Nómina; a
 * diferencia de Aplicaciones, no hay Almacén Local que descontar.
 */
export async function registrarAvanceActividad(actividadProgramadaId: string, input: RegistrarAvanceActividadInput, registradoPorId: string) {
  if (!input.hectareas || input.hectareas <= 0) throw new Error("Captura las hectáreas avanzadas en este reporte.");

  const programada = await prisma.actividadProgramada.findUniqueOrThrow({
    where: { id: actividadProgramadaId },
    include: { cuadros: true, variedades: true, actividad: true, realizadas: { select: { hectareas: true } } },
  });
  validarLineasActividad(input.lineas, programada.actividad.tipoRecurso);

  const yaReportadas = programada.realizadas.reduce((s, r) => s + Number(r.hectareas), 0);
  const totalConEste = yaReportadas + input.hectareas;
  if (totalConEste > Number(programada.hectareasTotalesProgramadas) + 0.0001) {
    throw new SuperficieExcedeProgramadoError(Number(programada.hectareasTotalesProgramadas), totalConEste);
  }

  if ((await diaEstaCerrado(programada.huertaId, input.fechaReal)) && !input.casoExtraordinario) {
    throw new DiaCerradoRequiereCasoExtraordinarioActividadError();
  }

  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(programada.actividad), config.tarifaGeneralHora);
  const fecha = new Date(input.fechaReal);
  const reparto = calcularRepartoAvance(gruposParaReparto(programada), input.hectareas);

  return prisma.$transaction(async (tx) => {
    const realizada = await tx.actividadRealizada.create({
      data: { actividadProgramadaId, fechaReal: fecha, registradoPorId, comentario: input.comentario, hectareas: input.hectareas },
    });

    await tx.actividadRealizadaCuadro.createMany({
      data: reparto.porMiembro.map((m) => {
        const { cuadroId, variedad } = parseClaveMiembro(m.clave);
        return { realizadaId: realizada.id, cuadroId, variedad, hectareasAtribuidas: m.hectareasAtribuidas };
      }),
    });

    await crearLineasYNomina(tx, realizada.id, programada.huertaId, programada.actividadId, fecha, input.hectareas, input.lineas, reparto, tarifaAplicada, registradoPorId);

    if (programada.actividad.nombre === NOMBRE_ACTIVIDAD_SEGUNDA_CINTILLA) {
      const cuadroIdsTocados = [...new Set(reparto.porMiembro.filter((m) => m.hectareasAtribuidas > 0.0001).map((m) => parseClaveMiembro(m.clave).cuadroId))];
      await aplicarSegundaCintillaTx(tx, cuadroIdsTocados, input.fechaReal);
    }

    return tx.actividadRealizada.findUniqueOrThrow({
      where: { id: realizada.id },
      include: { cuadros: { include: { cuadro: true } }, lineas: { include: INCLUDE_LINEA_ACTIVIDAD } },
    });
  });
}

/**
 * "Tirar 2da Cintilla" (V1 P5, 21-sep-2026 — pendiente moverla a Riego en
 * otra prioridad; se mantiene funcionando aquí mientras tanto): al reportar
 * avance, cada Sección de Riego a la que pertenecen los Cuadros TOCADOS
 * (hectareasAtribuidas > 0 en el reparto) queda con "Líneas de cintilla" =
 * 2 a partir de la fecha del avance.
 */
export const NOMBRE_ACTIVIDAD_SEGUNDA_CINTILLA = "Tirar 2da Cintilla";

async function aplicarSegundaCintillaTx(tx: TransactionClient, cuadroIds: string[], fechaReal: string) {
  const fecha = new Date(fechaReal);
  const vinculos = await tx.seccionRiegoCuadro.findMany({ where: { cuadroId: { in: cuadroIds } }, select: { seccionId: true } });
  for (const seccionId of new Set(vinculos.map((v) => v.seccionId))) {
    const vigente = await tx.seccionRiegoLineasCintilla.findFirst({
      where: { seccionId, vigenteDesde: { lte: fecha }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: fecha } }] },
    });
    if (vigente?.lineas === 2) continue;
    const posterior = await tx.seccionRiegoLineasCintilla.findFirst({ where: { seccionId, vigenteDesde: { gt: fecha } } });
    if (posterior) continue;
    await actualizarLineasCintillaTx(tx, seccionId, 2, fechaReal);
  }
}

export interface EditarAvanceActividadInput {
  hectareas: number;
  lineas: LineaActividadInput[];
  comentario?: string;
}

/**
 * Historial de reportes editable por separado (9.4, V1 P2 25-sep-2026) —
 * sujeto al candado de consistencia con Nómina y al mismo candado de
 * superficie total. Líneas, Uso Diario y mano de obra automática, y el
 * reparto guardado, se reemplazan completos.
 */
export async function editarAvanceActividad(realizadaId: string, input: EditarAvanceActividadInput, editadoPorId: string) {
  if (!input.hectareas || input.hectareas <= 0) throw new Error("Captura las hectáreas avanzadas en este reporte.");

  const realizada = await prisma.actividadRealizada.findUniqueOrThrow({
    where: { id: realizadaId },
    include: {
      actividadProgramada: { include: { cuadros: true, variedades: true, actividad: true, realizadas: { select: { id: true, hectareas: true } } } },
      lineas: true,
    },
  });
  validarLineasActividad(input.lineas, realizada.actividadProgramada.actividad.tipoRecurso);
  const fechaISO = realizada.fechaReal.toISOString().slice(0, 10);
  if (await diaEstaCerrado(realizada.actividadProgramada.huertaId, fechaISO)) throw new DiaCerradoActividadError();

  const programada = realizada.actividadProgramada;
  const yaReportadasOtros = programada.realizadas.filter((r) => r.id !== realizadaId).reduce((s, r) => s + Number(r.hectareas), 0);
  const totalConEste = yaReportadasOtros + input.hectareas;
  if (totalConEste > Number(programada.hectareasTotalesProgramadas) + 0.0001) {
    throw new SuperficieExcedeProgramadoError(Number(programada.hectareasTotalesProgramadas), totalConEste);
  }

  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(programada.actividad), config.tarifaGeneralHora);
  const lineaIdsAnteriores = realizada.lineas.map((l) => l.id);
  const reparto = calcularRepartoAvance(gruposParaReparto(programada), input.hectareas);

  return prisma.$transaction(async (tx) => {
    await tx.actividadRealizadaCuadro.deleteMany({ where: { realizadaId } });
    await tx.actividadRealizadaCuadro.createMany({
      data: reparto.porMiembro.map((m) => {
        const { cuadroId, variedad } = parseClaveMiembro(m.clave);
        return { realizadaId, cuadroId, variedad, hectareasAtribuidas: m.hectareasAtribuidas };
      }),
    });
    await tx.actividadRealizada.update({ where: { id: realizadaId }, data: { comentario: input.comentario, hectareas: input.hectareas } });

    await borrarUsoDiarioDeLineasTx(tx, lineaIdsAnteriores);
    await tx.registroNomina.deleteMany({ where: { origen: "automatico_actividad", referenciaOrigenId: realizadaId } });
    await tx.actividadRealizadaLineaPersona.deleteMany({ where: { lineaId: { in: lineaIdsAnteriores } } });
    await tx.actividadRealizadaLinea.deleteMany({ where: { realizadaId } });

    await crearLineasYNomina(tx, realizadaId, programada.huertaId, programada.actividadId, realizada.fechaReal, input.hectareas, input.lineas, reparto, tarifaAplicada, editadoPorId);

    return tx.actividadRealizada.findUniqueOrThrow({
      where: { id: realizadaId },
      include: { cuadros: { include: { cuadro: true } }, lineas: { include: INCLUDE_LINEA_ACTIVIDAD } },
    });
  });
}
