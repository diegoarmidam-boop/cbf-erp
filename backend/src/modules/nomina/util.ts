import type { ActividadCalc } from "@cbf/shared";

/** Prisma regresa `tarifa` como Decimal (decimal.js) — el motor de cálculo en @cbf/shared trabaja con number. */
export function aActividadCalc(actividad: { tarifa: unknown; usarTarifaGeneral: boolean }): ActividadCalc {
  return { tarifa: Number(actividad.tarifa), usarTarifaGeneral: actividad.usarTarifaGeneral };
}
