// Orden de Aplicación (9.7) y Orden de Fertirriego (9.5, Camino 2) —
// 25-ago-2026. Documentos de salida diseñados a partir de los formatos
// Excel reales que la empresa ya usa en campo — esta capa no recalcula
// nada del Recetario/mezcla por tanque, solo empaqueta y presenta esos
// datos ya construidos con el vocabulario exacto que pide el documento.

export type FrecuenciaFertirriego = "diario" | "cada_2_dias" | "cada_3_dias" | "patron_2_1";

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
