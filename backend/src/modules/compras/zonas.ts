import { prisma } from "../../core/db.js";

/**
 * Catálogo de Zonas y flete (9.14, 29-ago-2026) — exclusivo del Comparador
 * de Cotizaciones, ver comentario completo en el schema (ZonaFlete). La
 * Zona del comprador (Campeche) siempre tiene flete $0 por definición: se
 * fuerza aquí, no se confía en lo que mande el cliente, y solo puede
 * existir una Zona marcada así a la vez (desmarca cualquier otra al
 * crear/editar una nueva como zona del comprador).
 */
export function listarZonas(todas = false) {
  return prisma.zonaFlete.findMany({ where: todas ? {} : { activo: true }, orderBy: { nombre: "asc" } });
}

export interface ZonaInput {
  nombre: string;
  costoFleteKg: number;
  esZonaComprador?: boolean;
}

async function desmarcarOtrasZonasComprador(exceptoId?: string) {
  await prisma.zonaFlete.updateMany({
    where: { esZonaComprador: true, ...(exceptoId ? { id: { not: exceptoId } } : {}) },
    data: { esZonaComprador: false },
  });
}

export async function crearZona(input: ZonaInput) {
  const esZonaComprador = !!input.esZonaComprador;
  return prisma.$transaction(async (tx) => {
    if (esZonaComprador) {
      await tx.zonaFlete.updateMany({ where: { esZonaComprador: true }, data: { esZonaComprador: false } });
    }
    return tx.zonaFlete.create({
      data: { nombre: input.nombre, costoFleteKg: esZonaComprador ? 0 : input.costoFleteKg, esZonaComprador },
    });
  });
}

export async function editarZona(id: string, input: Partial<ZonaInput>) {
  return prisma.$transaction(async (tx) => {
    const actual = await tx.zonaFlete.findUniqueOrThrow({ where: { id } });
    // Si el caller no toca esZonaComprador en este edit, se respeta el
    // valor ya guardado — así no se puede colar un costoFleteKg distinto
    // de 0 en una Zona comprador existente por un PATCH parcial que solo
    // manda `costoFleteKg` sin repetir el flag.
    const esZonaComprador = input.esZonaComprador ?? actual.esZonaComprador;
    if (esZonaComprador) {
      await tx.zonaFlete.updateMany({ where: { esZonaComprador: true, id: { not: id } }, data: { esZonaComprador: false } });
    }
    return tx.zonaFlete.update({
      where: { id },
      data: {
        nombre: input.nombre,
        costoFleteKg: esZonaComprador ? 0 : input.costoFleteKg,
        esZonaComprador: input.esZonaComprador,
      },
    });
  });
}

export function actualizarActivoZona(id: string, activo: boolean) {
  return prisma.zonaFlete.update({ where: { id }, data: { activo } });
}
