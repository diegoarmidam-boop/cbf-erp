import { type FechaISO, type PeriodoNomina, semanaCalendarioLS, sumarDias } from "./fechas.js";

export function diasTrabajadosEnRango(fechasConActividad: FechaISO[], fechaIni: FechaISO, fechaFin: FechaISO): Set<FechaISO> {
  const dias = new Set<FechaISO>();
  for (const fecha of fechasConActividad) {
    if (fecha < fechaIni || fecha > fechaFin) continue;
    dias.add(fecha);
  }
  return dias;
}

// ---- (1) Asistencia perfecta semanal ----

export interface BonoAsistenciaPerfectaParams {
  diasRequeridos: number;
  monto: number;
}

/** Ventana [inicio, fin] que hay que evaluar para el bono de esta semana. */
export function ventanaAsistenciaPerfecta(hoy: FechaISO, diasRequeridos: number): PeriodoNomina {
  const semana = semanaCalendarioLS(hoy);
  return { inicio: semana.inicio, fin: sumarDias(semana.inicio, diasRequeridos - 1) };
}

export function calcularBonoAsistenciaPerfecta(
  diasTrabajados: Set<FechaISO>,
  params: BonoAsistenciaPerfectaParams
): { completo: boolean; monto: number; diasTrabajados: number } {
  const completo = diasTrabajados.size >= params.diasRequeridos;
  return { completo, monto: completo ? params.monto : 0, diasTrabajados: diasTrabajados.size };
}

// ---- (2) Permanencia por racha de meses sin faltar ----

export interface BonoPermanenciaRachaParams {
  mesesRequeridos: number;
  monto: number;
}

export interface SemanaAEvaluar {
  inicioSemana: FechaISO;
  finSemana: FechaISO;
}

/** Semanas (de la más reciente hacia atrás) que hay que revisar para confirmar la racha. */
export function semanasParaEvaluarRacha(hoy: FechaISO, mesesRequeridos: number): { semanas: SemanaAEvaluar[]; semanasNecesarias: number } {
  const semanasNecesarias = Math.max(1, Math.round(mesesRequeridos * 4.345));
  const semanas: SemanaAEvaluar[] = [];
  let finSemana = semanaCalendarioLS(hoy).fin;
  for (let i = 0; i < semanasNecesarias; i++) {
    const inicioSemana = sumarDias(finSemana, -5);
    semanas.push({ inicioSemana, finSemana });
    finSemana = sumarDias(inicioSemana, -2); // sábado de la semana previa
  }
  return { semanas, semanasNecesarias };
}

/**
 * `cumplioSemana` en el mismo orden que `semanasParaEvaluarRacha` (más
 * reciente primero) — true si trabajó >=6 días esa semana calendario y no
 * rompió ningún compromiso especial. La racha se corta en la primera falsa.
 */
export function calcularRachaPermanencia(
  cumplioSemana: boolean[],
  semanasNecesarias: number,
  monto: number
): { racha: number; completo: boolean; monto: number } {
  let racha = 0;
  for (const cumplio of cumplioSemana) {
    if (!cumplio) break;
    racha++;
  }
  const completo = racha >= semanasNecesarias;
  return { racha, completo, monto: completo ? monto : 0 };
}

// ---- (3) Día doble en fecha(s) específicas ----

export interface DetalleDiaDoble {
  fecha: FechaISO;
  pagoNormalDia: number;
  extraDia: number;
}

/** Extra a pagar un día marcado como "doble" — el pago normal del día ya viene calculado (registros individuales + grupales prorrateados). */
export function calcularExtraDiaDoble(pagoNormalDia: number, multiplicador: number): number {
  return pagoNormalDia * (multiplicador - 1);
}
