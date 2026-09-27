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
  // Alta pendiente de autorización (V1 P6, 27-sep-2026, 9.11a) — "+ Nueva
  // persona" desde Captura del día manda esto en true; una alta capturada
  // directo en RH no (ya viene completa/vetada, no necesita bandeja).
  pendienteAutorizacion?: boolean;
  // Periodicidad mensual (9.11b) — solo relevante si tipo=fijo y
  // puesto.periodicidad="mensual"; se fija una sola vez, ver actualizarPersonal.
  diaPagoMensual?: "primer_viernes" | "ultimo_viernes";
  // Forma de pago (9.11c) — transferencia solo para tipo=fijo por ahora.
  formaPago?: "efectivo" | "transferencia";
  banco?: string;
  numeroCuentaOClabe?: string;
  titularCuenta?: string;
}

export class TransferenciaSoloMensualError extends Error {
  constructor() {
    super("La forma de pago \"transferencia\" solo aplica a personal fijo, por ahora.");
  }
}

export class DiaPagoMensualNoEditableError extends Error {
  constructor() {
    super("El día de pago mensual se define una sola vez al contratar — ya no se puede cambiar después.");
  }
}

function validarFormaPago(tipo: "fijo" | "destajo", formaPago: "efectivo" | "transferencia" | undefined) {
  if (formaPago === "transferencia" && tipo !== "fijo") throw new TransferenciaSoloMensualError();
}

export function crearPersonal(input: AltaPersonalInput) {
  validarFormaPago(input.tipo, input.formaPago);
  // Alta pendiente desde Captura del día (9.11a) no manda `fechaIngreso` (la
  // versión ligera solo pide nombre) — pero la persona cuenta como activa
  // desde HOY (su costo ya corre para la Huerta), y el reporte de Nómina
  // usa `fechaIngreso` como punto de partida para "atrapar" lo acumulado
  // mientras está pendiente (ver `desde` en reporte.ts). Sin esto, si pasan
  // varias semanas sin autorizar, esas semanas se perderían del cálculo en
  // vez de acumularse. Una alta normal de RH sigue sin fecha por defecto,
  // tal como ya era (RH la captura después).
  const fechaIngreso = input.fechaIngreso
    ? new Date(input.fechaIngreso)
    : input.pendienteAutorizacion
      ? new Date()
      : undefined;
  return prisma.personal.create({
    data: {
      nombreCompleto: input.nombreCompleto,
      tipo: input.tipo,
      fechaNacimiento: input.fechaNacimiento ? new Date(input.fechaNacimiento) : undefined,
      identificacion: input.identificacion,
      domicilio: input.domicilio,
      telefono: input.telefono,
      telefonoEmergencia: input.telefonoEmergencia,
      fechaIngreso,
      huertaId: input.huertaId,
      puestoId: input.tipo === "fijo" ? input.puestoId : undefined,
      sueldo: input.tipo === "fijo" ? input.sueldo : undefined,
      rfc: input.tipo === "fijo" ? input.rfc : undefined,
      imssOSeguro: input.tipo === "fijo" ? input.imssOSeguro : undefined,
      pendienteAutorizacion: input.pendienteAutorizacion ?? false,
      diaPagoMensual: input.tipo === "fijo" ? input.diaPagoMensual : undefined,
      formaPago: input.formaPago ?? "efectivo",
      banco: input.formaPago === "transferencia" ? input.banco : undefined,
      numeroCuentaOClabe: input.formaPago === "transferencia" ? input.numeroCuentaOClabe : undefined,
      titularCuenta: input.formaPago === "transferencia" ? input.titularCuenta : undefined,
    },
  });
}

export async function actualizarPersonal(id: string, input: Partial<AltaPersonalInput>) {
  if (input.formaPago) {
    const actual = await prisma.personal.findUniqueOrThrow({ where: { id } });
    validarFormaPago(input.tipo ?? actual.tipo, input.formaPago);
  }
  if (input.diaPagoMensual !== undefined) {
    const actual = await prisma.personal.findUniqueOrThrow({ where: { id } });
    if (actual.diaPagoMensual && actual.diaPagoMensual !== input.diaPagoMensual) throw new DiaPagoMensualNoEditableError();
  }
  return prisma.personal.update({
    where: { id },
    data: {
      ...input,
      fechaNacimiento: input.fechaNacimiento ? new Date(input.fechaNacimiento) : undefined,
      fechaIngreso: input.fechaIngreso ? new Date(input.fechaIngreso) : undefined,
      banco: input.formaPago === "efectivo" ? null : input.banco,
      numeroCuentaOClabe: input.formaPago === "efectivo" ? null : input.numeroCuentaOClabe,
      titularCuenta: input.formaPago === "efectivo" ? null : input.titularCuenta,
    },
  });
}

/** Autoriza el alta pendiente (9.11a) — RH, tras completar los datos que falten con el PATCH normal. */
export async function autorizarAlta(id: string, autorizadoPorId: string) {
  return prisma.personal.update({
    where: { id },
    data: { pendienteAutorizacion: false, autorizadoPorId, fechaAutorizacion: new Date() },
  });
}

/** Altas pendientes de autorizar (9.11a) — bandeja de RH. */
export function listarAltasPendientes() {
  return prisma.personal.findMany({
    where: { activo: true, pendienteAutorizacion: true },
    include: { puesto: true, huerta: true },
    orderBy: { fechaIngreso: "asc" },
  });
}

export function darDeBaja(id: string, motivo: string, dadoBajaPorId: string) {
  return prisma.personal.update({
    where: { id },
    data: { activo: false, fechaBaja: new Date(), motivoBaja: motivo, dadoBajaPorId },
  });
}

export function listarPersonal(filtro?: { tipo?: "fijo" | "destajo"; incluirInactivos?: boolean; soloDisponibles?: boolean }) {
  return prisma.personal.findMany({
    where: {
      tipo: filtro?.tipo,
      activo: filtro?.incluirInactivos ? undefined : true,
      // Liquidación (9.11, 15-ago-2026): excluye a quien ya se liquidó y no
      // ha vuelto — distinto de la Baja formal (`activo`), sigue en el
      // catálogo pero no se ofrece para capturar trabajo nuevo.
      ...(filtro?.soloDisponibles ? { OR: [{ noDisponibleDesde: null }, { noDisponibleDesde: { gt: new Date() } }] } : {}),
    },
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
