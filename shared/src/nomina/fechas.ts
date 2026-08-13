// Fechas manejadas como texto ISO "YYYY-MM-DD" en todo el motor de nómina,
// igual que el mockup validado — evita bugs de huso horario al comparar/sumar
// fechas de captura de campo, sin depender de una librería externa.
export type FechaISO = string;

// 0=domingo .. 6=sábado, mismo índice que Date#getDay().
export const NOMBRES_DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"] as const;

export function diaIndexDesdeNombre(nombre: string): number {
  const idx = NOMBRES_DIAS.indexOf(nombre.toLowerCase() as (typeof NOMBRES_DIAS)[number]);
  if (idx === -1) throw new Error(`Día inválido: "${nombre}". Debe ser uno de: ${NOMBRES_DIAS.join(", ")}.`);
  return idx;
}

function toDate(fechaISO: FechaISO): Date {
  return new Date(fechaISO + "T12:00:00");
}

export function isoDate(d: Date): FechaISO {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// `new Date().toISOString()` da la fecha en UTC, no la local — de las 18:00
// a medianoche (hora de México) UTC ya es el día siguiente, así que "hoy"
// saldría mal calculado durante esas horas. `isoDate` usa los getters
// locales del Date, por eso es la forma correcta de obtener "hoy".
export function hoyISO(): FechaISO {
  return isoDate(new Date());
}

export function sumarDias(fechaISO: FechaISO, dias: number): FechaISO {
  const d = toDate(fechaISO);
  d.setDate(d.getDate() + dias);
  return isoDate(d);
}

export function diferenciaDias(fechaA: FechaISO, fechaB: FechaISO): number {
  return Math.round((toDate(fechaA).getTime() - toDate(fechaB).getTime()) / 86_400_000);
}

export interface PeriodoNomina {
  inicio: FechaISO;
  fin: FechaISO;
}

/**
 * Periodo de nómina (viernes→jueves para CBF, pero el día de corte es
 * configurable por empresa) que contiene `fechaRef`.
 * diaCorteIndex: 0=domingo .. 6=sábado.
 */
export function calcularPeriodoNomina(fechaRef: FechaISO, diaCorteIndex: number): PeriodoNomina {
  const ref = toDate(fechaRef);
  const diaSemana = ref.getDay();
  const diff = (diaCorteIndex - diaSemana + 7) % 7;
  const finDate = new Date(ref);
  finDate.setDate(finDate.getDate() + diff);
  const inicioDate = new Date(finDate);
  inicioDate.setDate(inicioDate.getDate() - 6);
  return { inicio: isoDate(inicioDate), fin: isoDate(finDate) };
}

/** Cuántos cortes de nómina caen en el mes del periodo, y cuál número es este. */
export function semanaDelMesDePeriodo(periodoFin: FechaISO, diaCorteIndex: number): { semana: number; totalEnMes: number } {
  const fin = toDate(periodoFin);
  const mes = fin.getMonth();
  const anio = fin.getFullYear();
  let total = 0;
  let numero = 0;
  const cursor = new Date(anio, mes, 1);
  while (cursor.getMonth() === mes) {
    if (cursor.getDay() === diaCorteIndex) {
      total++;
      if (isoDate(cursor) === periodoFin) numero = total;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return { semana: numero || 1, totalEnMes: total || 1 };
}

/** El periodo mensual se paga por adelantado: el que contiene el día 1 del mes. */
export function periodoContieneDia1(periodo: PeriodoNomina): boolean {
  const inicioDate = toDate(periodo.inicio);
  const finDate = toDate(periodo.fin);
  const candidatos = [
    isoDate(new Date(inicioDate.getFullYear(), inicioDate.getMonth(), 1)),
    isoDate(new Date(finDate.getFullYear(), finDate.getMonth(), 1)),
  ];
  return candidatos.some((d) => d >= periodo.inicio && d <= periodo.fin);
}

export type Periodicidad = "semanal" | "quincenal" | "mensual";

export function fijoDebePagarseEnPeriodo(
  periodicidad: Periodicidad,
  periodo: PeriodoNomina,
  semanaInfo: { semana: number }
): boolean {
  if (periodicidad === "semanal") return true;
  if (periodicidad === "quincenal") return [2, 4].includes(semanaInfo.semana);
  if (periodicidad === "mensual") return periodoContieneDia1(periodo);
  return false;
}

export function diasRestantesPlazo(fecha: FechaISO, hoy: FechaISO, diasGracia: number): number {
  const deadline = sumarDias(fecha, diasGracia);
  return diferenciaDias(deadline, hoy);
}

export type EstadoPlazo = "al_corriente" | "vence_hoy" | "vencido";

export function estadoPlazo(fecha: FechaISO, hoy: FechaISO, diasGracia: number): EstadoPlazo {
  const restantes = diasRestantesPlazo(fecha, hoy, diasGracia);
  if (restantes > 0) return "al_corriente";
  if (restantes === 0) return "vence_hoy";
  return "vencido";
}

/** Lunes a sábado de la semana calendario que contiene la fecha (para bonos). */
export function semanaCalendarioLS(fechaRef: FechaISO): PeriodoNomina {
  const d = toDate(fechaRef);
  const dow = d.getDay();
  const diffALunes = dow === 0 ? -6 : 1 - dow;
  const lunes = new Date(d);
  lunes.setDate(lunes.getDate() + diffALunes);
  const sabado = new Date(lunes);
  sabado.setDate(sabado.getDate() + 5);
  return { inicio: isoDate(lunes), fin: isoDate(sabado) };
}
