export type ModoDosisGranular = "kg_ha" | "g_planta";

/**
 * Cantidad total de fertilizante granular (9.5) — kg/ha usa las hectáreas
 * totales de los Cuadros elegidos; g/planta usa el total de plantas
 * (Marco de Plantación, ver unidades-produccion/calculo.ts) y se divide
 * entre 1000 para convertir g→kg.
 */
export function calcularCantidadTotalGranular(
  modoDosis: ModoDosisGranular,
  dosisValor: number,
  hectareasTotales: number,
  plantasTotales: number
): number {
  return modoDosis === "kg_ha" ? dosisValor * hectareasTotales : (dosisValor * plantasTotales) / 1000;
}

export type ModoDosisFertirriego = "kg_ha" | "l_ha" | "g_ha";

/**
 * Cantidad total de producto para Fertirriego (9.5, Camino 2) — REVERSIÓN
 * 27-ago-2026: ya no reutiliza la fórmula de Aplicaciones (concentración ×
 * litros de mezcla/ha × hectáreas). En Fertirriego se prepara un solo
 * tanque de mezcla concentrada que se inyecta al sistema de riego — es el
 * agua del riego, no la del tanque, la que reparte el producto por
 * presión, así que el tamaño del tanque no limita ni determina hectáreas
 * cubiertas. Lo único que importa es la dosis directa del producto por
 * hectárea. g/ha se divide entre 1000 para quedar en kg (mismo criterio de
 * conversión que el resto del sistema); kg/ha y l/ha ya quedan en su
 * unidad base.
 */
export function calcularCantidadTotalFertirriego(dosisValor: number, dosisUnidad: ModoDosisFertirriego, hectareasTotales: number): number {
  const bruto = dosisValor * hectareasTotales;
  return dosisUnidad === "g_ha" ? bruto / 1000 : bruto;
}

/**
 * Formato de salida práctico para Fertirriego (mismo criterio que
 * formatearCantidadProducto de Aplicaciones, ver aplicaciones/calculo.ts) —
 * l_ha es volumen (L/mL), kg_ha y g_ha son masa (kg/g). No reutiliza esa
 * función directamente porque toma `ConcentracionUnidad`, no
 * `ModoDosisFertirriego` — misma lógica de redondeo, tipo de parámetro
 * distinto.
 */
export function formatearCantidadProductoFertirriego(dosisUnidad: ModoDosisFertirriego, cantidadEnUnidadBase: number): { valor: number; unidad: "mL" | "L" | "g" | "kg" } {
  const esVolumen = dosisUnidad === "l_ha";
  const unidadGrande = esVolumen ? "L" : "kg";
  const unidadChica = esVolumen ? "mL" : "g";

  if (cantidadEnUnidadBase < 1 && cantidadEnUnidadBase > 0) {
    return { valor: Math.round(cantidadEnUnidadBase * 1000), unidad: unidadChica };
  }
  return { valor: Math.round(cantidadEnUnidadBase * 100) / 100, unidad: unidadGrande };
}
