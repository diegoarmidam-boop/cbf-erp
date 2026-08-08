import type { Prisma } from "@prisma/client";
import { prisma, type TransactionClient } from "./db.js";

// Mecanismo genérico "Propone / Autoriza" (bloque 4), reutilizado por cada
// módulo en vez de reimplementarlo caso por caso: actividad nueva, alta de
// Personal, producto nuevo, compra manual, producto regulado para planta.

export class SolicitudYaResueltaError extends Error {
  constructor(public estadoActual: string) {
    super(`Esta solicitud ya fue resuelta (estado: ${estadoActual}) — probablemente por otro autorizador casi al mismo tiempo.`);
  }
}

export async function crearSolicitud(input: {
  tipo: string;
  entidadTabla: string;
  entidadId?: string;
  payload: Prisma.InputJsonValue;
  propuestoPorId: string;
}) {
  return prisma.solicitudPendiente.create({
    data: {
      tipo: input.tipo,
      entidadTabla: input.entidadTabla,
      entidadId: input.entidadId,
      payload: input.payload,
      propuestoPorId: input.propuestoPorId,
    },
  });
}

// Autorizar: aplica "primero en llegar gana" con un update condicionado al
// estado seguir en "pendiente" — evita que dos autorizadores casi
// simultáneos generen resultados contradictorios sin resolución manual.
// `activarEntidad` corre en la MISMA transacción, para que el cambio de
// estado de la solicitud y la activación real del catálogo sean atómicos.
export async function autorizarSolicitud(
  id: string,
  resueltoPorId: string,
  activarEntidad?: (tx: TransactionClient, solicitud: { payload: Prisma.JsonValue; entidadId: string | null }) => Promise<void>
) {
  return prisma.$transaction(async (tx) => {
    const actualizadas = await tx.solicitudPendiente.updateMany({
      where: { id, estado: "pendiente" },
      data: { estado: "autorizada", resueltoPorId, fechaResolucion: new Date() },
    });
    if (actualizadas.count === 0) {
      const actual = await tx.solicitudPendiente.findUniqueOrThrow({ where: { id } });
      throw new SolicitudYaResueltaError(actual.estado);
    }
    const solicitud = await tx.solicitudPendiente.findUniqueOrThrow({ where: { id } });
    if (activarEntidad) {
      await activarEntidad(tx, { payload: solicitud.payload, entidadId: solicitud.entidadId });
    }
    return solicitud;
  });
}

export async function rechazarSolicitud(id: string, resueltoPorId: string, motivoRechazo?: string) {
  const actualizadas = await prisma.solicitudPendiente.updateMany({
    where: { id, estado: "pendiente" },
    data: { estado: "rechazada", resueltoPorId, fechaResolucion: new Date(), motivoRechazo },
  });
  if (actualizadas.count === 0) {
    const actual = await prisma.solicitudPendiente.findUniqueOrThrow({ where: { id } });
    throw new SolicitudYaResueltaError(actual.estado);
  }
  return prisma.solicitudPendiente.findUniqueOrThrow({ where: { id } });
}

export function obtenerSolicitud(id: string) {
  return prisma.solicitudPendiente.findUnique({ where: { id } });
}

export function solicitudesPendientes(tipo?: string) {
  return prisma.solicitudPendiente.findMany({
    where: { estado: "pendiente", ...(tipo ? { tipo } : {}) },
    orderBy: { fechaPropuesta: "asc" },
  });
}
