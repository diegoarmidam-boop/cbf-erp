/**
 * Marco de Plantación → cálculo automático de plantas (9.1). No se captura
 * el número de plantas a mano — se calcula solo a partir de la distancia
 * entre surcos y entre plantas.
 */
export function plantasPorHectarea(distSurcosM: number, distPlantasM: number): number {
  if (distSurcosM <= 0 || distPlantasM <= 0) return 0;
  return 10_000 / (distSurcosM * distPlantasM);
}

export function plantasTotalesCuadro(hectareas: number, distSurcosM: number, distPlantasM: number): number {
  return plantasPorHectarea(distSurcosM, distPlantasM) * hectareas;
}

export interface AreaEfectivaResultado {
  areaEfectiva: number;
  porcentajeAprovechamiento: number;
}

/** Área efectiva = suma de hectáreas de los cuadros dados de alta. % de aprovechamiento = área efectiva / área total del rancho. */
export function calcularAreaEfectiva(hectareasTotalesRancho: number, hectareasPorCuadro: number[]): AreaEfectivaResultado {
  const areaEfectiva = hectareasPorCuadro.reduce((s, h) => s + h, 0);
  const porcentajeAprovechamiento = hectareasTotalesRancho > 0 ? (areaEfectiva / hectareasTotalesRancho) * 100 : 0;
  return { areaEfectiva, porcentajeAprovechamiento };
}

/**
 * Orden numérico para Cuadros y Secciones de Riego/Válvulas (9.15): "Válvula 2"
 * debe salir antes que "Válvula 10". El nombre es texto libre, así que se
 * extrae el primer número embebido y se compara numéricamente; si no hay
 * número (o hay empate), cae a orden alfabético como respaldo.
 */
export function compararNombreNumerico(a: string, b: string): number {
  const numA = a.match(/\d+/);
  const numB = b.match(/\d+/);
  if (numA && numB) {
    const diferencia = Number(numA[0]) - Number(numB[0]);
    if (diferencia !== 0) return diferencia;
  } else if (numA || numB) {
    return numA ? -1 : 1;
  }
  return a.localeCompare(b, "es");
}

export function ordenarPorNombreNumerico<T>(items: T[], nombreDe: (item: T) => string): T[] {
  return [...items].sort((a, b) => compararNombreNumerico(nombreDe(a), nombreDe(b)));
}
