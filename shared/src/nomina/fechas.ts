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

export type Periodicidad = "semanal" | "catorcenal" | "quincenal" | "mensual";
export type DiaPagoMensual = "primer_viernes" | "ultimo_viernes";

/** Sábado de pago de un periodo (jueves de cierre + 2) — mismo criterio "se paga el sábado" para todas las periodicidades fijas. */
export function sabadoDePago(periodo: PeriodoNomina): FechaISO {
  return sumarDias(periodo.fin, 2);
}

/**
 * Sábado más cercano a una fecha — SIEMPRE hay un único más cercano (7 es
 * impar, nunca hay empate exacto a 3.5 días).
 */
export function sabadoMasCercanoA(fechaISO: FechaISO): FechaISO {
  const d = toDate(fechaISO);
  const dow = d.getDay(); // 0=domingo..6=sábado
  const diasDesdeSabadoAnterior = (dow + 1) % 7; // sábado=0, domingo=1, ... viernes=6
  const diasHastaSabadoSiguiente = (6 - dow + 7) % 7;
  return diasDesdeSabadoAnterior <= diasHastaSabadoSiguiente
    ? sumarDias(fechaISO, -diasDesdeSabadoAnterior)
    : sumarDias(fechaISO, diasHastaSabadoSiguiente);
}

function primerDiaMes(anio: number, mes0: number): FechaISO {
  return isoDate(new Date(anio, mes0, 1));
}
function ultimoDiaMes(anio: number, mes0: number): FechaISO {
  return isoDate(new Date(anio, mes0 + 1, 0));
}

/** Quincenal (9.11b): sábado más cercano al 15, y sábado más cercano al fin de mes — del mes al que pertenece el propio sábado de pago. */
function esSabadoQuincenal(sabado: FechaISO): boolean {
  const d = toDate(sabado);
  const anio = d.getFullYear();
  const mes0 = d.getMonth();
  const objetivo15 = sabadoMasCercanoA(isoDate(new Date(anio, mes0, 15)));
  const objetivoFin = sabadoMasCercanoA(ultimoDiaMes(anio, mes0));
  return sabado === objetivo15 || sabado === objetivoFin;
}

// Catorcenal (9.11b, "cada segundo sábado", 26 pagos/año): paridad de
// semanas desde un sábado de referencia fijo para toda la empresa (para que
// TODO el personal catorcenal cobre el mismo sábado) — 3-ene-2026 es sábado.
const REFERENCIA_CATORCENAL: FechaISO = "2026-01-03";
function esSabadoCatorcenal(sabado: FechaISO): boolean {
  const semanas = Math.round(diferenciaDias(sabado, REFERENCIA_CATORCENAL) / 7);
  return semanas % 2 === 0;
}

/** Mensual (9.11b): el viernes de inicio del periodo es el primer o último viernes del mes, según lo que la persona tenga configurado. */
function esPeriodoMensualDePersona(periodo: PeriodoNomina, diaPagoMensual: DiaPagoMensual | null | undefined): boolean {
  if (!diaPagoMensual) return false;
  const viernes = toDate(periodo.inicio); // el periodo empieza viernes (ver calcularPeriodoNomina)
  if (diaPagoMensual === "primer_viernes") {
    return periodo.inicio === sumarDias(primerDiaMes(viernes.getFullYear(), viernes.getMonth()), diaDelPrimerViernes(viernes.getFullYear(), viernes.getMonth()));
  }
  const siguienteViernes = toDate(sumarDias(periodo.inicio, 7));
  return siguienteViernes.getMonth() !== viernes.getMonth();
}

function diaDelPrimerViernes(anio: number, mes0: number): number {
  const d = new Date(anio, mes0, 1);
  const dow = d.getDay();
  return (5 - dow + 7) % 7; // 5=viernes; offset en días desde el día 1
}

/** Pagos al año de cada periodicidad (9.11b) — el sueldo de Personal.sueldo se entiende ANUAL; cada pago sale de sueldo ÷ este número, para que la persona gane lo mismo en cualquier esquema. */
export function pagosPorAnio(periodicidad: Periodicidad): number {
  if (periodicidad === "semanal") return 52;
  if (periodicidad === "catorcenal") return 26;
  if (periodicidad === "quincenal") return 24;
  return 12; // mensual
}

export function fijoDebePagarseEnPeriodo(
  periodicidad: Periodicidad,
  periodo: PeriodoNomina,
  opciones: { diaPagoMensual?: DiaPagoMensual | null } = {}
): boolean {
  if (periodicidad === "semanal") return true;
  const sabado = sabadoDePago(periodo);
  if (periodicidad === "catorcenal") return esSabadoCatorcenal(sabado);
  if (periodicidad === "quincenal") return esSabadoQuincenal(sabado);
  if (periodicidad === "mensual") return esPeriodoMensualDePersona(periodo, opciones.diaPagoMensual);
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
