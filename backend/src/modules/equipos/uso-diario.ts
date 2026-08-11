import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";

export function listarUsoDiario(equipoId: string) {
  return prisma.equipoUsoDiario.findMany({
    where: { equipoId },
    include: { operador: { select: { nombreCompleto: true } }, huerta: { select: { nombre: true } } },
    orderBy: { fecha: "desc" },
  });
}

/** Solo control/trazabilidad — no genera cargo contable por Cuadro (9.13). Implementos toman las horas del tractor que los jaló, no capturan uso propio aparte. */
export function registrarUsoDiario(equipoId: string, fecha: string, operadorId: string, horas: number, huertaId: string) {
  return prisma.equipoUsoDiario.create({ data: { equipoId, fecha: new Date(fecha), operadorId, horas, huertaId } });
}

/**
 * Alimentación automática desde una línea de Turbina/Aguilón de un reporte
 * de avance de Aplicaciones (9.7/9.13, 8-ago-2026) — mismo mecanismo que
 * `referenciaOrigenId` en RegistroNomina: se identifica por
 * `referenciaLineaId` para poder reemplazarla limpio si el reporte se edita
 * (ver `borrarUsoDiarioDeLineasTx`), sin volver a capturar el uso a mano.
 */
export async function registrarUsoDiarioAutomaticoTx(
  tx: TransactionClient,
  equipoId: string,
  fecha: Date,
  operadorId: string,
  horas: number,
  huertaId: string,
  referenciaLineaId: string
) {
  await tx.equipoUsoDiario.create({
    data: { equipoId, fecha, operadorId, horas, huertaId, origen: "automatico_aplicacion", referenciaLineaId },
  });
}

/** Limpia el Uso Diario automático de las líneas de un reporte — se usa antes de recrearlas al editar. */
export async function borrarUsoDiarioDeLineasTx(tx: TransactionClient, lineaIds: string[]) {
  if (lineaIds.length === 0) return;
  await tx.equipoUsoDiario.deleteMany({ where: { referenciaLineaId: { in: lineaIds } } });
}
