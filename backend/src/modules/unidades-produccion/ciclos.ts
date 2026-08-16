import { prisma } from "../../core/db.js";
import { obtenerVersionVigente } from "./cuadros.js";

export interface VariedadCicloInput {
  cuadroId: string;
  variedad: string;
  hectareas: number;
  porcentaje?: number;
}

export class YaHayCicloActivoError extends Error {
  constructor() {
    super("Esta Huerta ya tiene un Ciclo activo — ciérralo antes de dar de alta uno nuevo (una Huerta solo puede tener un Ciclo activo a la vez).");
  }
}

export class SuperficieExcedeCuadroError extends Error {
  constructor(nombreCuadro: string, hectareasCuadro: number, hectareasAsignadas: number) {
    super(
      `El Cuadro "${nombreCuadro}" tiene ${hectareasCuadro} ha, pero entre las variedades capturadas se están asignando ${hectareasAsignadas} ha — la suma no puede exceder la superficie del Cuadro.`
    );
  }
}

export function listarCiclos(huertaId: string) {
  return prisma.ciclo.findMany({ where: { huertaId }, include: { variedades: true }, orderBy: { fechaInicio: "desc" } });
}

export function cicloActivo(huertaId: string) {
  return prisma.ciclo.findFirst({ where: { huertaId, activo: true }, include: { variedades: true } });
}

/** Candado: la suma de hectáreas por Cuadro entre variedades no puede exceder la superficie vigente del Cuadro. */
async function validarSuperficiePorCuadro(variedades: VariedadCicloInput[]) {
  const sumaPorCuadro = new Map<string, number>();
  for (const v of variedades) {
    sumaPorCuadro.set(v.cuadroId, (sumaPorCuadro.get(v.cuadroId) ?? 0) + v.hectareas);
  }
  for (const [cuadroId, suma] of sumaPorCuadro) {
    const [cuadro, version] = await Promise.all([
      prisma.cuadro.findUnique({ where: { id: cuadroId } }),
      obtenerVersionVigente(cuadroId),
    ]);
    if (version && suma > Number(version.hectareas) + 0.0001) {
      throw new SuperficieExcedeCuadroError(cuadro?.nombre ?? cuadroId, Number(version.hectareas), suma);
    }
  }
}

/**
 * Editar un Ciclo ya creado (9.1) — corrige tipo/fecha/composición varietal
 * sin tener que cerrarlo y volver a crearlo. Reemplaza la lista completa de
 * variedades (mismo patrón que "todas las variedades de un Cuadro se
 * capturan juntas en un mismo registro" del alta) y vuelve a correr el
 * mismo candado de superficie por Cuadro.
 */
export async function editarCiclo(
  cicloId: string,
  tipo: "cultivo" | "descanso" | "prueba",
  fechaInicio: string,
  variedades: VariedadCicloInput[]
) {
  await validarSuperficiePorCuadro(variedades);

  return prisma.$transaction(async (tx) => {
    const ciclo = await tx.ciclo.update({ where: { id: cicloId }, data: { tipo, fechaInicio: new Date(fechaInicio) } });
    await tx.cicloVariedad.deleteMany({ where: { cicloId } });
    for (const v of variedades) {
      await tx.cicloVariedad.create({
        data: { cicloId, cuadroId: v.cuadroId, variedad: v.variedad, hectareas: v.hectareas, porcentaje: v.porcentaje },
      });
    }
    return ciclo;
  });
}

export async function crearCiclo(
  huertaId: string,
  tipo: "cultivo" | "descanso" | "prueba",
  fechaInicio: string,
  variedades: VariedadCicloInput[]
) {
  const existente = await cicloActivo(huertaId);
  if (existente) throw new YaHayCicloActivoError();

  await validarSuperficiePorCuadro(variedades);

  return prisma.$transaction(async (tx) => {
    const ciclo = await tx.ciclo.create({ data: { huertaId, tipo, fechaInicio: new Date(fechaInicio) } });
    for (const v of variedades) {
      await tx.cicloVariedad.create({
        data: { cicloId: ciclo.id, cuadroId: v.cuadroId, variedad: v.variedad, hectareas: v.hectareas, porcentaje: v.porcentaje },
      });
    }
    return ciclo;
  });
}

/**
 * Avance de etapa (9.1): el documento dice que la transición a Cosecha es
 * automática cuando se registra la primera cosecha — pero Cosecha es
 * Fase posterior (fuera de V1), así que por ahora esto es una acción
 * manual de Gerente Técnico/Director. Cuando se construya Cosecha, ese
 * módulo puede llamar a esta misma función en vez de requerir el clic.
 * Como el Ciclo vive a nivel Huerta (no por Cuadro), la sincronización
 * "todos los cuadros se mueven juntos" ya está garantizada por diseño —
 * no hay nada más que sincronizar.
 */
export function avanzarEtapa(cicloId: string, etapa: "preparacion_suelo" | "desarrollo" | "cosecha_empaque" | "post_cosecha") {
  return prisma.ciclo.update({ where: { id: cicloId }, data: { etapaActual: etapa } });
}

/** No existe replante a media cosecha (9.1): cerrar el ciclo completo de la Huerta cuando termina. */
export function cerrarCiclo(cicloId: string) {
  return prisma.ciclo.update({ where: { id: cicloId }, data: { activo: false, fechaFin: new Date() } });
}
