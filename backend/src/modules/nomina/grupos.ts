import { prisma } from "../../core/db.js";
import { sumarDias, type FechaISO } from "@cbf/shared";

/** Roster fijo del grupo en una fecha — sin los ajustes del día (ausente/sustituto). */
export async function rosterFijoEnFecha(grupoId: string, fecha: FechaISO): Promise<string[]> {
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

/**
 * Quiénes de verdad participan del grupo ese día — roster fijo ajustado por
 * el checklist de asistencia dinámica de esa fecha (9.11): quien se
 * desmarcó como ausente no entra al reparto de pago; quien sustituyó sí
 * entra, aunque no sea miembro fijo todavía.
 */
export async function miembrosDeGrupoEnFecha(grupoId: string, fecha: FechaISO): Promise<string[]> {
  const base = new Set(await rosterFijoEnFecha(grupoId, fecha));
  const marcas = await prisma.grupoAsistenciaDia.findMany({ where: { grupoId, fecha: new Date(fecha) } });
  for (const m of marcas) {
    if (m.tipo === "ausente") base.delete(m.personalId);
    else if (m.tipo === "sustituto") base.add(m.personalId);
  }
  return [...base];
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

/** Checklist del día: roster fijo + marcas de asistencia dinámica ya guardadas para esa fecha. */
export async function checklistDiaDeGrupo(grupoId: string, fecha: FechaISO) {
  const [rosterIds, marcas] = await Promise.all([
    rosterFijoEnFecha(grupoId, fecha),
    prisma.grupoAsistenciaDia.findMany({ where: { grupoId, fecha: new Date(fecha) }, include: { personal: true } }),
  ]);
  const roster = rosterIds.length
    ? await prisma.personal.findMany({ where: { id: { in: rosterIds } }, orderBy: { nombreCompleto: "asc" } })
    : [];
  return { roster, marcas };
}

export interface MarcaAsistenciaDiaInput {
  personalId: string;
  tipo: "ausente" | "sustituto";
}

/** Fechas (en orden) en que este grupo tuvo un RegistroNomina guardado — "días trabajados" del grupo, base de la regla de 3 días seguidos. */
async function fechasTrabajadasDelGrupo(grupoId: string): Promise<string[]> {
  const registros = await prisma.registroNomina.findMany({
    where: { grupoId },
    select: { fecha: true },
    distinct: ["fecha"],
    orderBy: { fecha: "asc" },
  });
  return registros.map((r) => r.fecha.toISOString().slice(0, 10));
}

/** Racha de días CONSECUTIVOS trabajados por el grupo (no calendario crudo) en los que personalId quedó marcado con `tipo`, terminando en `fechaHasta`. */
async function rachaConsecutiva(grupoId: string, personalId: string, fechaHasta: FechaISO, tipo: "ausente" | "sustituto"): Promise<number> {
  const fechasTrabajadas = await fechasTrabajadasDelGrupo(grupoId);
  const idx = fechasTrabajadas.indexOf(fechaHasta);
  if (idx < 0) return 0;
  let racha = 0;
  for (let i = idx; i >= 0; i--) {
    const marca = await prisma.grupoAsistenciaDia.findUnique({
      where: { grupoId_fecha_personalId: { grupoId, fecha: new Date(fechasTrabajadas[i]!), personalId } },
    });
    if (marca?.tipo === tipo) racha++;
    else break;
  }
  return racha;
}

/**
 * Regla de "se vuelve fijo" / "sale del roster" a los 3 días seguidos
 * (9.11): 3 sustituciones seguidas -> pasa a integrante fijo del grupo.
 * 3 ausencias seguidas -> sale del roster fijo. Nota de alcance (sin
 * excepción todavía): el documento contempla una excepción por "falta
 * justificada registrada en Asistencia", pero Asistencia (9.11) hoy solo
 * registra faltas INjustificadas — no existe todavía un campo de falta
 * justificada que revisar, así que esta regla por ahora no tiene excepción.
 */
async function aplicarReglaTresDias(grupoId: string, personalId: string, fecha: FechaISO): Promise<void> {
  // El cambio de roster arranca el día DESPUÉS del 3er día consecutivo ("al
  // 4to día ya cuenta/sale") — nunca el mismo día en que se completó la
  // racha, para no pisar el ajuste de reparto ya aplicado ese día vía el
  // checklist (GrupoAsistenciaDia).
  const diaSiguiente = sumarDias(fecha, 1);

  const rachaSustituto = await rachaConsecutiva(grupoId, personalId, fecha, "sustituto");
  if (rachaSustituto >= 3) {
    await agregarMiembroAGrupo(grupoId, personalId, diaSiguiente);
    return;
  }
  const rachaAusente = await rachaConsecutiva(grupoId, personalId, fecha, "ausente");
  if (rachaAusente >= 3) {
    await quitarMiembroDeGrupo(grupoId, personalId, fecha);
  }
}

/** Guarda el checklist de asistencia dinámica de un grupo para un día — reemplaza las marcas previas de esa fecha. */
export async function guardarAsistenciaDia(
  grupoId: string,
  fecha: FechaISO,
  marcas: MarcaAsistenciaDiaInput[],
  registradoPorId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.grupoAsistenciaDia.deleteMany({ where: { grupoId, fecha: new Date(fecha) } });
    for (const m of marcas) {
      await tx.grupoAsistenciaDia.create({
        data: { grupoId, fecha: new Date(fecha), personalId: m.personalId, tipo: m.tipo, registradoPorId },
      });
    }
  });
  for (const m of marcas) {
    await aplicarReglaTresDias(grupoId, m.personalId, fecha);
  }
}
