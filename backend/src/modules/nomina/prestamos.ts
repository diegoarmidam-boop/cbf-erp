import { sumarDias, type FechaISO } from "@cbf/shared";
import { prisma } from "../../core/db.js";

export interface NuevoPrestamoInput {
  personalId: string;
  montoTotal: number;
  motivo: string;
  periodicidad: "semanal" | "quincenal";
  montoPorDescuento: number;
  fechaPrimerDescuento: FechaISO;
}

export async function crearPrestamo(input: NuevoPrestamoInput) {
  if (input.montoTotal <= 0) throw new Error("El monto debe ser mayor a cero.");
  if (input.montoPorDescuento <= 0) throw new Error("El descuento por periodo debe ser mayor a cero.");

  return prisma.prestamo.create({
    data: {
      personalId: input.personalId,
      montoTotal: input.montoTotal,
      motivo: input.motivo,
      periodicidad: input.periodicidad,
      montoPorDescuento: input.montoPorDescuento,
      fechaPrimerDescuento: new Date(input.fechaPrimerDescuento),
      proximoDescuento: new Date(input.fechaPrimerDescuento),
      saldoPendiente: input.montoTotal,
    },
  });
}

/** Un préstamo "aplica" en el periodo si su próximo descuento cae dentro de ese periodo (o antes). */
export function prestamoAplicaEnPeriodo(proximoDescuento: FechaISO, periodoFin: FechaISO): boolean {
  return proximoDescuento <= periodoFin;
}

export async function aplicarDescuento(prestamoId: string, aplicadoPorId: string, periodoFin: FechaISO): Promise<number> {
  const prestamo = await prisma.prestamo.findUniqueOrThrow({ where: { id: prestamoId } });
  const saldoActual = Number(prestamo.saldoPendiente);
  const montoDescuento = Math.min(Number(prestamo.montoPorDescuento), saldoActual);
  const saldoNuevo = Math.max(0, saldoActual - montoDescuento);
  const liquidado = saldoNuevo <= 0;
  const proximoDescuentoISO = prestamo.proximoDescuento.toISOString().slice(0, 10);

  await prisma.$transaction([
    prisma.prestamo.update({
      where: { id: prestamoId },
      data: {
        saldoPendiente: saldoNuevo,
        activo: !liquidado,
        proximoDescuento: liquidado
          ? prestamo.proximoDescuento
          : new Date(sumarDias(proximoDescuentoISO, prestamo.periodicidad === "quincenal" ? 14 : 7)),
      },
    }),
    prisma.prestamoDescuento.create({
      data: { prestamoId, periodoFin: new Date(periodoFin), monto: montoDescuento, aplicadoPorId },
    }),
  ]);

  return montoDescuento;
}

export function listarPrestamos(filtro?: { personalId?: string; activo?: boolean }) {
  return prisma.prestamo.findMany({
    where: { personalId: filtro?.personalId, activo: filtro?.activo },
    include: { personal: { select: { nombreCompleto: true } } },
    orderBy: { fechaPrimerDescuento: "desc" },
  });
}

export function historialPrestamo(prestamoId: string) {
  return prisma.prestamoDescuento.findMany({ where: { prestamoId }, orderBy: { fechaAplicado: "asc" } });
}
