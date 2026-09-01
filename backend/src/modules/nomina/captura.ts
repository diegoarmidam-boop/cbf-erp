import { candadoDependeEmpacadoresBloquea, montoDependeEmpacadoresPorPersona, tarifaEfectiva, totalRegistro, type FechaISO } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";
import { miembrosDeGrupoEnFecha } from "./grupos.js";
import { aActividadCalc } from "./util.js";
import { verificarSemanaNoConfirmada } from "./semana-confirmada.js";

// Nombre real de la actividad "Empacador" (individual_caja) — de ahí sale
// el número de cajas del que dependen los esquemas "Depende de Empacadores"
// (Lavador, Pasador de fruta, Armador de cajas, Fungicida, Seleccionadoras,
// etc.). Confirmado con Diego 11-ago-2026: por ahora, sin módulo de Empaque
// todavía, todo esto se sigue capturando manual aquí en Nómina.
const NOMBRE_ACTIVIDAD_EMPACADOR = "Empacador";

/**
 * Monto real de un registro de Nómina. "Depende de Empacadores" es un caso
 * especial (9.11): lo que la persona capturó en "cantidad" no representa
 * nada de pago en este esquema (solo marca que trabajó ese día en ese rol)
 * — el pago real es una bolsa (cajas de "Empacador" ese día/Huerta × tarifa
 * de ESTA actividad) dividida entre cuántas personas están en ESTA misma
 * actividad ese día/Huerta. El resto de esquemas usan cantidad×tarifa
 * normal (totalRegistro).
 */
export async function montoRegistroNomina(
  registro: {
    huertaId: string;
    fecha: Date;
    actividadId: string;
    personalId?: string | null;
    grupoId?: string | null;
    cantidad: unknown;
    actividad: { tarifa: unknown; usarTarifaGeneral: boolean; esquemaPago: string };
  },
  tarifaGeneralHora: number | null
): Promise<number> {
  if (registro.actividad.esquemaPago !== "depende_empacadores") {
    return totalRegistro(Number(registro.cantidad), aActividadCalc(registro.actividad), tarifaGeneralHora);
  }

  const [cajasAgg, registrosMismaActividad] = await Promise.all([
    prisma.registroNomina.aggregate({
      _sum: { cantidad: true },
      where: { huertaId: registro.huertaId, fecha: registro.fecha, actividad: { nombre: NOMBRE_ACTIVIDAD_EMPACADOR } },
    }),
    prisma.registroNomina.findMany({
      where: { huertaId: registro.huertaId, fecha: registro.fecha, actividadId: registro.actividadId },
      select: { personalId: true, grupoId: true },
    }),
  ]);
  const cajasTotalesEmpacador = Number(cajasAgg._sum.cantidad ?? 0);
  // Cada persona/grupo cuenta como una sola unidad al dividir — si el
  // registro de esta línea es grupal, ese grupo se cuenta una vez aquí, y
  // su parte se reparte entre los miembros más abajo (mismo patrón que
  // grupal_remolque, sin dividir dos veces de más).
  const unidades = new Set(registrosMismaActividad.map((r) => r.personalId ?? `grupo:${r.grupoId}`));
  const tarifaActividad = tarifaEfectiva(aActividadCalc(registro.actividad), tarifaGeneralHora);
  return montoDependeEmpacadoresPorPersona({ cajasTotalesEmpacador, tarifaActividad, personasEnActividad: unidades.size });
}

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

/**
 * Registros de una Huerta/fecha — manuales (editables, lo que se resave al
 * guardar) y automáticos (los que llegaron de Aplicaciones/Fertilizantes/
 * Cosecha/Empaque, de solo lectura aquí — bloqueados para edición directa,
 * marcados visualmente por `origen` distinto de "manual").
 */
export async function obtenerCapturaDelDia(huertaId: string, fecha: FechaISO) {
  return prisma.registroNomina.findMany({
    where: { huertaId, fecha: new Date(fecha) },
    include: { actividad: true, personal: true, cuadro: true },
    orderBy: { fechaCaptura: "asc" },
  });
}

/** Huertas dentro del alcance del usuario — su propia UP si está restringido, o todas las activas si tiene alcance multi-rancho/global. */
export async function huertasEnAlcance(huertaIdAlcance: string | null) {
  return prisma.huerta.findMany({
    where: { activo: true, ...(huertaIdAlcance ? { id: huertaIdAlcance } : {}) },
    orderBy: { nombre: "asc" },
  });
}

/** Vista "Todas UPs" (9.11): la misma captura del día, para cada Huerta dentro del alcance del usuario, en una sola llamada. */
export async function obtenerCapturaTodasUPs(fecha: FechaISO, huertaIdAlcance: string | null) {
  const huertas = await huertasEnAlcance(huertaIdAlcance);
  return Promise.all(
    huertas.map(async (huerta) => {
      const [registros, cerrado] = await Promise.all([obtenerCapturaDelDia(huerta.id, fecha), diaEstaCerrado(huerta.id, fecha)]);
      const sugerencia = registros.length === 0 && !cerrado ? await obtenerSugerenciaDesdeAyer(huerta.id, fecha) : [];
      return { huerta, registros, cerrado, sugerencia };
    })
  );
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
  capturadoPorId: string,
  opciones: { permitirDiaCerrado?: boolean } = {}
): Promise<void> {
  // Semana ya confirmada/pagada (29-ago-2026): candado permanente, SIN
  // excepción de rol — a diferencia del candado de abajo (día cerrado, que
  // sí tiene override para ROLES_EDITAR_NOMINA), este nunca se puede pasar.
  await verificarSemanaNoConfirmada(fecha);

  // Edición después de cerrado (9.11): solo para quien tiene permiso de
  // "editar" en Nómina (verificado en la ruta) — el propio Supervisor sigue
  // bloqueado por el candado normal.
  if (!opciones.permitirDiaCerrado && (await diaEstaCerrado(huertaId, fecha))) throw new DiaCerradoError();

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

/**
 * Ganancia por destajo de una persona en un rango de fechas — individual
 * directo, grupal prorrateado entre quienes estaban ese día.
 * `huertaId` (29-ago-2026, vista "por Huerta" del Reporte semanal):
 * opcional — sin él, agrega en todas las Huertas donde trabajó (default,
 * sin cambios de comportamiento); con él, solo lo ganado en esa Huerta esa
 * semana, para responder "cuánto le debemos a esta persona con cargo a
 * esta Huerta", no su ganancia total.
 */
export async function gananciaDestajoEnRango(personalId: string, fechaIni: FechaISO, fechaFin: FechaISO, huertaId?: string): Promise<number> {
  const registros = await prisma.registroNomina.findMany({
    where: {
      fecha: { gte: new Date(fechaIni), lte: new Date(fechaFin) },
      ...(huertaId ? { huertaId } : {}),
      OR: [{ personalId }, { grupo: { miembros: { some: { personalId } } } }],
    },
    include: { actividad: true },
  });

  const config = await obtenerConfigNomina();
  let total = 0;
  for (const r of registros) {
    const montoTotal = await montoRegistroNomina(r, config.tarifaGeneralHora);
    if (r.personalId === personalId) {
      total += montoTotal;
    } else if (r.grupoId) {
      const miembros = await miembrosDeGrupoEnFecha(r.grupoId, r.fecha.toISOString().slice(0, 10));
      if (miembros.includes(personalId)) total += montoTotal / (miembros.length || 1);
    }
  }
  return total;
}
