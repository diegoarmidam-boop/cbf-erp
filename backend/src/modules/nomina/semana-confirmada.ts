import { calcularPeriodoNomina, type FechaISO } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";

/**
 * Candado permanente por semana de nómina (29-ago-2026) — ver comentario
 * completo en el schema, modelo NominaSemanaConfirmada. A diferencia de
 * DiaCerrado, esto NO tiene reapertura ni excepción de rol: se verifica
 * incondicionalmente en cada función de escritura que afecte el neto de
 * una semana ya confirmada (captura del día, bonos, préstamos), sin pasar
 * por requirePermission/tienePermiso — esos sí exentan a Director
 * General/Encargado de Sistemas, esto no.
 */
export class SemanaConfirmadaError extends Error {
  constructor(fechaFin: FechaISO) {
    super(`La semana de nómina que termina el ${fechaFin} ya está confirmada y pagada — queda bloqueada para edición de forma permanente.`);
  }
}

/** fechaFin (fecha de corte) de la semana de nómina que contiene `fecha`. */
export async function fechaFinDeSemana(fecha: FechaISO): Promise<FechaISO> {
  const config = await obtenerConfigNomina();
  return calcularPeriodoNomina(fecha, config.diaCorteIndex).fin;
}

export async function semanaEstaConfirmada(fechaFin: FechaISO): Promise<boolean> {
  const fila = await prisma.nominaSemanaConfirmada.findUnique({ where: { fechaFin: new Date(fechaFin) } });
  return !!fila;
}

/** Guarda incondicional — lanza SemanaConfirmadaError si la semana que contiene `fecha` ya está confirmada. Sin parámetro de override: a propósito, ver comentario de la clase. */
export async function verificarSemanaNoConfirmada(fecha: FechaISO): Promise<void> {
  const fechaFin = await fechaFinDeSemana(fecha);
  if (await semanaEstaConfirmada(fechaFin)) throw new SemanaConfirmadaError(fechaFin);
}

/** Guarda incondicional a partir de un fechaFin ya conocido (bonos/préstamos, que ya traen su propio periodoFin) — evita recalcular el periodo. */
export async function verificarSemanaFinNoConfirmada(fechaFin: FechaISO): Promise<void> {
  if (await semanaEstaConfirmada(fechaFin)) throw new SemanaConfirmadaError(fechaFin);
}

/** Crea el candado — se llama una sola vez, al confirmar la semana (ver reporte.ts, confirmarNominaSemanal). Upsert por si acaso, pero el caller ya debe haber verificado que no existía. */
export async function marcarSemanaConfirmada(fechaFin: FechaISO, confirmadoPorId: string): Promise<void> {
  await prisma.nominaSemanaConfirmada.upsert({
    where: { fechaFin: new Date(fechaFin) },
    update: {},
    create: { fechaFin: new Date(fechaFin), confirmadoPorId },
  });
}
