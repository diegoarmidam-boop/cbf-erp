import { sumarDias, type FechaISO } from "./fechas.js";

/**
 * Bono de Asistencia Semanal (V1 P7, 21-sep-2026; lógica completa en el
 * documento vivo, 9.11 Nómina → Bonos). Funciones puras — el acceso a datos
 * vive en backend/src/modules/nomina/bonoAsistencia.ts.
 */

export const MONTO_BONO_ASISTENCIA_DEFAULT = 400;
export const MONTO_BONO_ASISTENCIA_ESPECIAL = 200;

// Mínimos de horas por día para contar como "completo" (sin destajo).
export const MIN_HORAS_TIEMPO_COMPLETO = { entreSemana: 8, sabado: 5.33 };
export const MIN_HORAS_MEDIO_TIEMPO = { entreSemana: 5.33, sabado: 4 };

// Tolerancia numérica: las horas se guardan con 3 decimales (5.333 vs 5.33).
const EPSILON = 0.0001;

export interface SemanaBono {
  /** Lunes. */
  inicio: FechaISO;
  /** Sábado. */
  fin: FechaISO;
  /** Los 6 días, Lunes a Sábado. */
  dias: FechaISO[];
}

/** 0=domingo .. 6=sábado. */
export function diaSemanaDe(fecha: FechaISO): number {
  return new Date(fecha + "T12:00:00").getDay();
}

/**
 * Semana del bono a partir de la semana de Nómina que se cierra (Viernes a
 * Jueves, pago sábado): SIEMPRE es la semana de asistencia Lunes a Sábado
 * de la semana calendario que contiene el Viernes con que arrancó esa
 * Nómina — ej. Nómina Vie 11 a Jue 17 -> bono Lun 7 a Sáb 12. Cálculo 100%
 * automático desde la fecha real, nunca capturado a mano.
 */
export function semanaBonoDePeriodoNomina(periodoInicio: FechaISO): SemanaBono {
  const dow = diaSemanaDe(periodoInicio); // 0=dom
  const desdeLunes = (dow + 6) % 7; // lunes=0 .. domingo=6
  const inicio = sumarDias(periodoInicio, -desdeLunes);
  const dias = Array.from({ length: 6 }, (_, i) => sumarDias(inicio, i));
  return { inicio, fin: dias[5]!, dias };
}

export function minimoHorasDelDia(fecha: FechaISO, medioTiempo: boolean): number {
  const esSabado = diaSemanaDe(fecha) === 6;
  const min = medioTiempo ? MIN_HORAS_MEDIO_TIEMPO : MIN_HORAS_TIEMPO_COMPLETO;
  return esSabado ? min.sabado : min.entreSemana;
}

export interface AjusteAsistenciaDia {
  diaCompleto: boolean;
  justificado: boolean;
}

export type MotivoDia = "ajuste" | "destajo" | "horas" | "falta" | "horas_insuficientes";

export interface EvaluacionDia {
  fecha: FechaISO;
  /** ¿Cuenta como cumplido para el bono? (incluye ajustes justificados) */
  cumple: boolean;
  motivo: MotivoDia;
  horas: number;
  minimoHoras: number;
  hayRegistro: boolean;
  tieneDestajo: boolean;
}

/**
 * Decide un día, por persona:
 * - Si hay fila en Ajustes de Asistencia para esa persona y fecha exacta,
 *   REEMPLAZA lo que el sistema calculó: cumple si está marcado Día Completo
 *   o Justificado; si no, se pierde el bono.
 * - Sin registro ese día -> falta.
 * - Con alguna actividad a destajo (pagada por pieza, sin horas) -> completo
 *   automático, sin importar las horas de las demás actividades.
 * - Si no, se suman las horas de todas sus actividades y se comparan contra
 *   el mínimo (tiempo completo 8h L-V / 5.33h sáb; medio tiempo 5.33h / 4h).
 */
export function evaluarDiaAsistencia(input: {
  fecha: FechaISO;
  medioTiempo: boolean;
  hayRegistro: boolean;
  tieneDestajo: boolean;
  horas: number;
  ajuste?: AjusteAsistenciaDia | null;
}): EvaluacionDia {
  const minimoHoras = minimoHorasDelDia(input.fecha, input.medioTiempo);
  const base = { fecha: input.fecha, horas: input.horas, minimoHoras, hayRegistro: input.hayRegistro, tieneDestajo: input.tieneDestajo };
  if (input.ajuste) {
    return { ...base, cumple: input.ajuste.diaCompleto || input.ajuste.justificado, motivo: "ajuste" };
  }
  if (!input.hayRegistro) return { ...base, cumple: false, motivo: "falta" };
  if (input.tieneDestajo) return { ...base, cumple: true, motivo: "destajo" };
  if (input.horas + EPSILON >= minimoHoras) return { ...base, cumple: true, motivo: "horas" };
  return { ...base, cumple: false, motivo: "horas_insuficientes" };
}

export interface ConfigBonoPersona {
  nunca: boolean;
  montoEspecial: boolean;
  medioTiempo: boolean;
}

export interface ResultadoBonoAsistencia {
  monto: number;
  cumple: boolean;
  /** "nunca" = en la lista de "nunca recibe bono" (se revisa primero). */
  motivoSinBono: "nunca" | "dias_incompletos" | null;
  dias: EvaluacionDia[];
}

/**
 * Todo o nada: se pierde el bono completo si falla cualquiera de los 6
 * días sin justificar. "Nunca recibe bono" se revisa primero, antes que
 * cualquier otra cosa. Monto: default ($400) o especial ($200) por persona.
 */
export function calcularBonoAsistenciaSemanal(input: {
  config: ConfigBonoPersona;
  dias: EvaluacionDia[];
  montoDefault: number;
  montoEspecial: number;
}): ResultadoBonoAsistencia {
  if (input.config.nunca) return { monto: 0, cumple: false, motivoSinBono: "nunca", dias: input.dias };
  const cumple = input.dias.length === 6 && input.dias.every((d) => d.cumple);
  if (!cumple) return { monto: 0, cumple: false, motivoSinBono: "dias_incompletos", dias: input.dias };
  return { monto: input.config.montoEspecial ? input.montoEspecial : input.montoDefault, cumple: true, motivoSinBono: null, dias: input.dias };
}
