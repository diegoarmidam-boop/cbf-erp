import { prisma } from "../../core/db.js";

export interface AltaPersonalInput {
  nombreCompleto: string;
  tipo: "fijo" | "destajo";
  fechaNacimiento?: string;
  identificacion?: string;
  domicilio?: string;
  telefono?: string;
  telefonoEmergencia?: string;
  fechaIngreso?: string;
  huertaId?: string;
  // Solo relevante/esperado para tipo=fijo — versión ligera de destajo no los pide.
  puestoId?: string;
  sueldo?: number;
  rfc?: string;
  imssOSeguro?: string;
}

export function crearPersonal(input: AltaPersonalInput) {
  return prisma.personal.create({
    data: {
      nombreCompleto: input.nombreCompleto,
      tipo: input.tipo,
      fechaNacimiento: input.fechaNacimiento ? new Date(input.fechaNacimiento) : undefined,
      identificacion: input.identificacion,
      domicilio: input.domicilio,
      telefono: input.telefono,
      telefonoEmergencia: input.telefonoEmergencia,
      fechaIngreso: input.fechaIngreso ? new Date(input.fechaIngreso) : undefined,
      huertaId: input.huertaId,
      puestoId: input.tipo === "fijo" ? input.puestoId : undefined,
      sueldo: input.tipo === "fijo" ? input.sueldo : undefined,
      rfc: input.tipo === "fijo" ? input.rfc : undefined,
      imssOSeguro: input.tipo === "fijo" ? input.imssOSeguro : undefined,
    },
  });
}

export function actualizarPersonal(id: string, input: Partial<AltaPersonalInput>) {
  return prisma.personal.update({
    where: { id },
    data: {
      ...input,
      fechaNacimiento: input.fechaNacimiento ? new Date(input.fechaNacimiento) : undefined,
      fechaIngreso: input.fechaIngreso ? new Date(input.fechaIngreso) : undefined,
    },
  });
}

export function darDeBaja(id: string, motivo: string, dadoBajaPorId: string) {
  return prisma.personal.update({
    where: { id },
    data: { activo: false, fechaBaja: new Date(), motivoBaja: motivo, dadoBajaPorId },
  });
}

export function listarPersonal(filtro?: { tipo?: "fijo" | "destajo"; incluirInactivos?: boolean }) {
  return prisma.personal.findMany({
    where: { tipo: filtro?.tipo, activo: filtro?.incluirInactivos ? undefined : true },
    include: { puesto: true, documentos: true },
    orderBy: { nombreCompleto: "asc" },
  });
}

export function obtenerPersonal(id: string) {
  return prisma.personal.findUnique({
    where: { id },
    include: { puesto: true, documentos: true, huerta: true },
  });
}
