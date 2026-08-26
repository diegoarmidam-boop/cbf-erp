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

/**
 * Cantidad de producto para un volumen de mezcla ya conocido (ej. la
 * capacidad de un tanque completo, o la fracción de un tanque parcial) —
 * mismo criterio de conversión que calcularCantidadTotal (÷1000 para
 * mL→L/g→kg; kg/L ya en kg), pero sin pasar por hectáreas: aquí el volumen
 * ya es el dato de entrada, no litros/ha × hectáreas.
 */
export function cantidadProductoParaVolumen(
  concentracionValor: number,
  concentracionUnidad: ConcentracionUnidad,
  volumenLitros: number
): number {
  const bruto = concentracionValor * volumenLitros;
  return concentracionUnidad === "kg_l" ? bruto : bruto / 1000;
}

export interface TanqueParcial {
  fraccion: number; // 0–1, ej. 0.6 = 60% del tanque
  volumenMezcla: number; // litros de mezcla de ese tanque parcial
  cantidadProducto: number; // en la unidad base (L o kg, mismo criterio que calcularCantidadTotal)
}

export interface CalculoMezclaTanque {
  hectareasPorTanque: number;
  numeroTanques: number; // con decimales, ej. 6.6
  tanquesCompletos: number; // parte entera
  cantidadProductoPorTanqueCompleto: number; // en la unidad base (L o kg)
  tanqueParcial: TanqueParcial | null; // null si numeroTanques es un entero exacto
}

/**
 * Mezcla por tanque/recipiente (bloque nuevo, 20-ago-2026): dado que toda
 * mezcla se prepara en algún recipiente, dice exactamente cuánto producto
 * echarle a cada tanque completo y al tanque parcial que sobra. Aplica
 * igual en Aplicaciones (9.7) y Fertirriego (9.6-bis) — ambos ya comparten
 * la misma estructura de concentración + litros de mezcla(o agua)/ha, así
 * que reutilizan esta misma función sin duplicar la lógica.
 *
 * Ejemplo de validación (documento vivo, 20-ago-2026): dosis 50 L
 * mezcla/ha, tanque de 1000 L → 20 ha/tanque. Producto a 2 ml/L → 2 L de
 * producto por tanque completo. 132 ha totales → 6.6 tanques → 6 tanques
 * completos de 2 L cada uno, + 1 tanque parcial al 60% (600 L de mezcla,
 * 1.2 L de producto).
 */
export function calcularMezclaPorTanque(
  concentracionValor: number,
  concentracionUnidad: ConcentracionUnidad,
  litrosMezclaPorHa: number,
  capacidadTanque: number,
  hectareasTotales: number
): CalculoMezclaTanque {
  const hectareasPorTanque = capacidadTanque / litrosMezclaPorHa;
  const numeroTanques = hectareasTotales / hectareasPorTanque;
  // Epsilon para no dejar un tanque parcial fantasma de 0.0000001 por
  // errores de redondeo de punto flotante cuando el número de tanques es,
  // en realidad, un entero exacto (ej. 6 en vez de 5.999999999).
  const EPSILON = 1e-9;
  const tanquesCompletos = Math.floor(numeroTanques + EPSILON);
  const fraccionParcial = numeroTanques - tanquesCompletos;

  const cantidadProductoPorTanqueCompleto = cantidadProductoParaVolumen(concentracionValor, concentracionUnidad, capacidadTanque);

  let tanqueParcial: TanqueParcial | null = null;
  if (fraccionParcial > EPSILON) {
    const volumenMezcla = capacidadTanque * fraccionParcial;
    tanqueParcial = {
      fraccion: fraccionParcial,
      volumenMezcla,
      cantidadProducto: cantidadProductoParaVolumen(concentracionValor, concentracionUnidad, volumenMezcla),
    };
  }

  return { hectareasPorTanque, numeroTanques, tanquesCompletos, cantidadProductoPorTanqueCompleto, tanqueParcial };
}

export interface CantidadFormateada {
  valor: number;
  unidad: "mL" | "L" | "g" | "kg";
}

/**
 * Formato de salida práctico (bloque nuevo, 20-ago-2026): quien prepara el
 * tanque no debe hacer ningún cálculo mental — nunca "0.0012 kg" cuando lo
 * natural es "1.2 g". `cantidadEnUnidadBase` ya viene en la unidad base de
 * calcularCantidadTotal/cantidadProductoParaVolumen (L para ml_l/g_l, kg
 * para kg_l) — si el valor es menor a 1 en esa unidad, se muestra en la
 * unidad chica (mL/g) en vez de un decimal minúsculo.
 *
 * Redondeo (Orden de Aplicación/Fertirriego, 25-ago-2026, función
 * compartida — no duplicar): en campo no se puede pesar una fracción de
 * gramo ni medir una fracción de mililitro, así que la unidad chica
 * (mL/g) redondea a entero; L/kg sí admiten 2 decimales (báscula/probeta
 * de precisión). Esta misma regla aplica también al desglose de mezcla
 * por tanque de Recetario — antes redondeaba siempre a 2 decimales.
 */
export function formatearCantidadProducto(concentracionUnidad: ConcentracionUnidad, cantidadEnUnidadBase: number): CantidadFormateada {
  // ml_l: el total ya viene convertido de mL a L (÷1000) — unidad base L.
  // g_l y kg_l: el total es masa, no volumen — unidad base kg en ambos
  // casos (g_l también se divide ÷1000, de gramos a kilogramos; kg_l ya
  // nace en kg). Confundir esto mostraba "mL" para un producto en g/L, que
  // no tiene sentido físico (es masa, no volumen).
  const esVolumen = concentracionUnidad === "ml_l";
  const unidadGrande = esVolumen ? "L" : "kg";
  const unidadChica = esVolumen ? "mL" : "g";

  if (cantidadEnUnidadBase < 1 && cantidadEnUnidadBase > 0) {
    return { valor: redondearEntero(cantidadEnUnidadBase * 1000), unidad: unidadChica };
  }
  return { valor: redondearDosDecimales(cantidadEnUnidadBase), unidad: unidadGrande };
}

function redondearDosDecimales(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function redondearEntero(valor: number): number {
  return Math.round(valor);
}
