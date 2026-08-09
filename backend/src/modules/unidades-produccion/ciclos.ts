import { prisma } from "../../core/db.js";

export interface VariedadCicloInput {
  cuadroId: string;
  variedad: string;
  hectareas?: number;
  porcentaje?: number;
}

export class YaHayCicloActivoError extends Error {
  constructor() {
    super("Esta Huerta ya tiene un Ciclo activo — ciérralo antes de dar de alta uno nuevo (una Huerta solo puede tener un Ciclo activo a la vez).");
  }
}

export function listarCiclos(huertaId: string) {
  return prisma.ciclo.findMany({ where: { huertaId }, include: { variedades: true }, orderBy: { fechaInicio: "desc" } });
}

export function cicloActivo(huertaId: string) {
  return prisma.ciclo.findFirst({ where: { huertaId, activo: true }, include: { variedades: true } });
}

export async function crearCiclo(
  huertaId: string,
  tipo: "cultivo" | "descanso" | "prueba",
  fechaInicio: string,
  variedades: VariedadCicloInput[]
) {
  const existente = await cicloActivo(huertaId);
  if (existente) throw new YaHayCicloActivoError();

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
