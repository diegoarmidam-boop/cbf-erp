export type ConcentracionUnidad = "ml_l" | "g_l" | "kg_l";

/**
 * Cantidad total a partir de concentración + litros de mezcla/agua por
 * hectárea + hectáreas totales (9.7) — misma fórmula que reutiliza
 * Fertilización (9.5, granular por concentración y fertirriego). ml/L y g/L
 * se dividen entre 1000 (mL→L, g→kg); kg/L ya queda en kg.
 */
export function calcularCantidadTotal(
  concentracionValor: number,
  concentracionUnidad: ConcentracionUnidad,
  litrosMezclaPorHa: number,
  hectareasTotales: number
): number {
  const bruto = concentracionValor * litrosMezclaPorHa * hectareasTotales;
  return concentracionUnidad === "kg_l" ? bruto : bruto / 1000;
}
