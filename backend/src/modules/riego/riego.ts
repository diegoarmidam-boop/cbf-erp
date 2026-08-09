import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";

export class FertirriegoNoActivoError extends Error {
  constructor() {
    super("No hay un fertirriego programado y entregado para esta Sección en esta fecha.");
  }
}

/**
 * El fertirriego vigente de una Sección en una fecha (9.5/9.6): programado
 * por Sección, entregado a la Huerta, y dentro de su rango de fechas. Si
 * hay más de uno vigente (caso raro), se toma el más reciente.
 */
async function fertirriegoVigente(tx: TransactionClient | typeof prisma, seccionId: string, fecha: Date) {
  const vinculo = await tx.fertirriegoSeccion.findFirst({
    where: {
      seccionId,
      fertirriego: { estado: "entregada", fechaInicio: { lte: fecha }, fechaFin: { gte: fecha } },
    },
    include: { fertirriego: { include: { producto: true } } },
    orderBy: { fertirriego: { fechaCreacion: "desc" } },
  });
  return vinculo?.fertirriego ?? null;
}

/** Para que la pantalla sepa si ofrecer la casilla "¿se metió el fertirriego?" (9.6). */
export async function fertirriegoActivoDeSeccion(seccionId: string, fecha: string) {
  const fertirriego = await fertirriegoVigente(prisma, seccionId, new Date(fecha));
  if (!fertirriego) return null;
  return { fertirriegoId: fertirriego.id, producto: fertirriego.producto };
}

export function obtenerRiegoDiario(seccionId: string, fecha: string) {
  return prisma.riegoRegistroDiario.findUnique({ where: { seccionId_fecha: { seccionId, fecha: new Date(fecha) } } });
}

export function historialRiego(seccionId: string) {
  return prisma.riegoRegistroDiario.findMany({ where: { seccionId }, orderBy: { fecha: "desc" } });
}

export interface RegistrarRiegoInput {
  horas: number;
  fertirriegoConfirmado: boolean;
  cantidadAplicada?: number;
}

/**
 * Captura diaria por Sección de Riego (9.6): horas regadas (histórico,
 * nunca genera mano de obra — el Regador es rol fijo) y, si hay un
 * fertirriego vigente ya entregado, cuánto se metió ese día — ese consumo
 * descuenta directo el Almacén Local de la Huerta, mismo mecanismo que
 * Aplicaciones/Fertilización granular. Editar un día ya capturado ajusta
 * el descuento por la diferencia en vez de volver a descontar todo.
 */
export async function registrarRiegoDiario(seccionId: string, fecha: string, input: RegistrarRiegoInput, capturadoPorId: string) {
  const fechaDate = new Date(fecha);
  const seccion = await prisma.seccionRiego.findUniqueOrThrow({ where: { id: seccionId } });

  const cantidadNueva = input.fertirriegoConfirmado ? (input.cantidadAplicada ?? 0) : 0;

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.riegoRegistroDiario.findUnique({ where: { seccionId_fecha: { seccionId, fecha: fechaDate } } });
    const cantidadAnterior = anterior?.fertirriegoConfirmado ? Number(anterior.cantidadAplicada ?? 0) : 0;
    const delta = cantidadNueva - cantidadAnterior;

    if (delta !== 0) {
      const fertirriego = await fertirriegoVigente(tx, seccionId, fechaDate);
      if (!fertirriego) throw new FertirriegoNoActivoError();

      const local = await tx.almacenLocal.upsert({
        where: { huertaId_productoId: { huertaId: seccion.huertaId, productoId: fertirriego.productoId } },
        update: { cantidadReportadaAcumulada: { increment: delta } },
        create: { huertaId: seccion.huertaId, productoId: fertirriego.productoId, cantidadReportadaAcumulada: Math.max(delta, 0) },
      });
      await tx.almacenLocalMovimiento.create({
        data: {
          almacenLocalId: local.id,
          tipo: delta > 0 ? "consumo_reportado" : "ajuste_manual",
          cantidad: Math.abs(delta),
          capturadoPorId,
        },
      });
    }

    return tx.riegoRegistroDiario.upsert({
      where: { seccionId_fecha: { seccionId, fecha: fechaDate } },
      update: { horas: input.horas, fertirriegoConfirmado: input.fertirriegoConfirmado, cantidadAplicada: cantidadNueva, capturadoPorId },
      create: {
        seccionId,
        fecha: fechaDate,
        horas: input.horas,
        fertirriegoConfirmado: input.fertirriegoConfirmado,
        cantidadAplicada: cantidadNueva,
        capturadoPorId,
      },
    });
  });
}
