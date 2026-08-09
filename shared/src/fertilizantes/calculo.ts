export type ModoDosisGranular = "kg_ha" | "g_planta";

/**
 * Cantidad total de fertilizante granular (9.5) — kg/ha usa las hectáreas
 * totales de los Cuadros elegidos; g/planta usa el total de plantas
 * (Marco de Plantación, ver unidades-produccion/calculo.ts) y se divide
 * entre 1000 para convertir g→kg. El fertirriego reutiliza directamente
 * la fórmula de Aplicaciones (misma concentración × litros/ha × hectáreas).
 */
export function calcularCantidadTotalGranular(
  modoDosis: ModoDosisGranular,
  dosisValor: number,
  hectareasTotales: number,
  plantasTotales: number
): number {
  return modoDosis === "kg_ha" ? dosisValor * hectareasTotales : (dosisValor * plantasTotales) / 1000;
}
