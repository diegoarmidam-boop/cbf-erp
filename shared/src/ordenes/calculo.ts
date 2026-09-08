// Orden de Aplicación (9.7) y Orden de Fertirriego (9.5, Camino 2) —
// 25-ago-2026. Documentos de salida diseñados a partir de los formatos
// Excel reales que la empresa ya usa en campo — esta capa no recalcula
// nada del Recetario/mezcla por tanque, solo empaqueta y presenta esos
// datos ya construidos con el vocabulario exacto que pide el documento.

export type FrecuenciaFertirriego = "diario" | "cada_2_dias" | "cada_3_dias" | "patron_2_1" | "dias_semana";

/**
 * "Días específicos de la semana" (Prioridad 5, 7-sep-2026) — checkboxes
 * Lunes a Domingo, exclusiva de Fertirriego, convive con las demás
 * Frecuencias (no las reemplaza). No es un intervalo parejo como las otras
 * (no se puede describir con un offset%N desde el inicio), así que tiene su
 * propio cálculo por fecha real en vez de por ventana de offsets. Los días
 * se guardan con el mismo criterio que `Date.getDay()` nativo de JS
 * (0=Domingo..6=Sábado).
 */

/** Riegos en la semana (5.2): CONSTANTE — el número de días marcados, no depende de en qué día de la semana arranque el rango (a diferencia de las otras Frecuencias, que sí varían según dónde caiga el offset 0). */
export function riegosEnSemanaDiasSemana(diasSemana: number[]): number {
  return diasSemana.length;
}

/**
 * Día de la semana a prueba de zona horaria — mismo problema que ya resuelve
 * `semanaDeFecha` anclando a "T12:00:00": las fechas `@db.Date` de Prisma
 * llegan como medianoche UTC, así que `.getDay()` directo puede correrse un
 * día completo en huso horario negativo (confirmado: en Campeche, UTC-6,
 * "2026-08-31" medianoche UTC da Domingo en vez de Lunes). Se reconstruye a
 * partir de los componentes UTC (el día calendario real que se guardó) a
 * mediodía LOCAL antes de leer el día.
 */
function diaSemanaSeguro(fecha: Date): number {
  return new Date(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), 12).getDay();
}

/** Total de campaña (5.3): cuenta las fechas reales del rango [inicio, fin] que caen en alguno de los días marcados. */
export function riegosEnRangoDiasSemana(fechaInicio: Date, fechaFin: Date, diasSemana: number[]): number {
  const marcados = new Set(diasSemana);
  let cuenta = 0;
  const cursor = new Date(Date.UTC(fechaInicio.getUTCFullYear(), fechaInicio.getUTCMonth(), fechaInicio.getUTCDate()));
  const fin = Date.UTC(fechaFin.getUTCFullYear(), fechaFin.getUTCMonth(), fechaFin.getUTCDate());
  while (cursor.getTime() <= fin) {
    if (marcados.has(diaSemanaSeguro(cursor))) cuenta++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cuenta;
}

/** ¿Es `fecha` uno de los días marcados? — usado por el recordatorio diario de Riego (5.4, 9.6). */
export function diaMarcadoDiasSemana(fecha: Date, diasSemana: number[]): boolean {
  return diasSemana.includes(diaSemanaSeguro(fecha));
}

/**
 * "Semana" de una Orden (25-ago-2026): ventana de 7 días que arranca en la
 * fecha de inicio de la programación — no la semana calendario Lunes-a-
 * Domingo, porque la Frecuencia de Fertirriego se cuenta a partir de esa
 * fecha, no de un lunes arbitrario (ver riegosEnSemana). Se calcula con
 * aritmética de fechas simple, sin depender de las convenciones de
 * "semana de nómina" (día de corte, L-S) que son un concepto distinto.
 */
export interface SemanaOrden {
  inicio: string; // YYYY-MM-DD
  fin: string; // YYYY-MM-DD, inicio + 6 días
}

export function semanaDeFecha(fechaInicioISO: string): SemanaOrden {
  const d = new Date(fechaInicioISO + "T12:00:00");
  d.setDate(d.getDate() + 6);
  const fin = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return { inicio: fechaInicioISO, fin };
}

/**
 * Cuántas veces cae la Frecuencia dentro de una ventana de `dias` días,
 * contando desde el día 0 (el propio día de inicio siempre riega/aplica).
 * Validado contra el ejemplo del documento vivo: "cada tercer día" en un
 * rango de 7 días → 3 riegos (días 0, 3 y 6).
 */
export function riegosEnVentana(frecuencia: FrecuenciaFertirriego, dias: number): number {
  let cuenta = 0;
  for (let offset = 0; offset < dias; offset++) {
    if (diaAplicaFrecuencia(frecuencia, offset)) cuenta++;
  }
  return cuenta;
}

function diaAplicaFrecuencia(frecuencia: FrecuenciaFertirriego, offsetDesdeInicio: number): boolean {
  switch (frecuencia) {
    case "diario":
      return true;
    case "cada_2_dias":
      return offsetDesdeInicio % 2 === 0;
    case "cada_3_dias":
      return offsetDesdeInicio % 3 === 0;
    // "2 sí, 1 no": ciclo de 3 días, los primeros 2 riegan, el tercero no.
    case "patron_2_1":
      return offsetDesdeInicio % 3 !== 2;
    // No es un offset parejo — usa riegosEnRangoDiasSemana/diaMarcadoDiasSemana en vez de esta función.
    case "dias_semana":
      throw new Error("dias_semana no usa riegosEnVentana/riegosEnSemana — usa riegosEnRangoDiasSemana/riegosEnSemanaDiasSemana.");
  }
}

/** Riegos en la semana (ventana de 7 días) de la Orden de Fertirriego. */
export function riegosEnSemana(frecuencia: FrecuenciaFertirriego): number {
  return riegosEnVentana(frecuencia, 7);
}

/**
 * Dato exclusivo de Drench (Orden de Aplicación): mL de solución por
 * planta = volumen total de agua (mL) ÷ plantas a tratar. Variable,
 * recalculado cada vez — nunca un valor fijo. `null` si no hay plantas a
 * tratar conocidas (Cuadro sin Marco de Plantación configurado) para no
 * dividir entre cero ni inventar un dato.
 */
export function mlSolucionPorPlanta(volumenTotalAguaLitros: number, plantasATratar: number): number | null {
  if (!plantasATratar || plantasATratar <= 0) return null;
  return (volumenTotalAguaLitros * 1000) / plantasATratar;
}
