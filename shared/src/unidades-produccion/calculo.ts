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
