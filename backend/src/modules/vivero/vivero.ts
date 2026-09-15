import { prisma } from "../../core/db.js";
import { intentarComprometer, stockTotalProductoTx } from "../almacen/movimientos.js";

export class CicloSinCharolaConfirmadaError extends Error {
  constructor() {
    super("Este Ciclo todavía no tiene tipo/cavidades de charola confirmados — captúralos antes de dar de alta un Lote.");
  }
}

/** Tipo de charola y cavidades (5.2): se definen al iniciar el Ciclo y quedan constantes durante todo el Ciclo. */
export function actualizarCharolaCiclo(cicloId: string, tipoCharola: string, cavidadesPorCharola: number) {
  return prisma.ciclo.update({ where: { id: cicloId }, data: { tipoCharola, cavidadesPorCharola } });
}

export interface CrearLoteInput {
  cicloId: string;
  variedad: string;
  fechaSiembraCharolas: string;
  fechaRemojo?: string;
  fechaCalentar?: string;
  fechaTapado?: string;
  fechaSalidaVivero?: string;
}

/** Lote de siembra (5.3): grupo de charolas de una Variedad sembradas el mismo día. Las 5 fechas se capturan por LOTE. */
export async function crearLote(input: CrearLoteInput, creadoPorId: string) {
  const ciclo = await prisma.ciclo.findUniqueOrThrow({ where: { id: input.cicloId } });
  if (!ciclo.tipoCharola || !ciclo.cavidadesPorCharola) throw new CicloSinCharolaConfirmadaError();

  return prisma.viveroLote.create({
    data: {
      cicloId: input.cicloId,
      variedad: input.variedad,
      fechaSiembraCharolas: new Date(input.fechaSiembraCharolas),
      fechaRemojo: input.fechaRemojo ? new Date(input.fechaRemojo) : undefined,
      fechaCalentar: input.fechaCalentar ? new Date(input.fechaCalentar) : undefined,
      fechaTapado: input.fechaTapado ? new Date(input.fechaTapado) : undefined,
      fechaSalidaVivero: input.fechaSalidaVivero ? new Date(input.fechaSalidaVivero) : undefined,
      creadoPorId,
    },
  });
}

export interface ActualizarFechasLoteInput {
  fechaRemojo?: string;
  fechaCalentar?: string;
  fechaSiembraCharolas?: string;
  fechaTapado?: string;
  fechaSalidaVivero?: string;
}

/** Las 5 fechas se van completando conforme avanza el proceso real, no todas se saben de una vez. */
export function actualizarFechasLote(loteId: string, input: ActualizarFechasLoteInput) {
  return prisma.viveroLote.update({
    where: { id: loteId },
    data: {
      fechaRemojo: input.fechaRemojo ? new Date(input.fechaRemojo) : undefined,
      fechaCalentar: input.fechaCalentar ? new Date(input.fechaCalentar) : undefined,
      fechaSiembraCharolas: input.fechaSiembraCharolas ? new Date(input.fechaSiembraCharolas) : undefined,
      fechaTapado: input.fechaTapado ? new Date(input.fechaTapado) : undefined,
      fechaSalidaVivero: input.fechaSalidaVivero ? new Date(input.fechaSalidaVivero) : undefined,
    },
  });
}

export function listarLotes(cicloId: string) {
  return prisma.viveroLote.findMany({ where: { cicloId }, include: { charolas: true }, orderBy: { fechaSiembraCharolas: "desc" } });
}

export function obtenerLote(loteId: string) {
  return prisma.viveroLote.findUniqueOrThrow({ where: { id: loteId }, include: { charolas: true, riegos: true, traspasos: { include: { conteos: true } } } });
}

export class CodigoCharolaDuplicadoError extends Error {
  constructor(codigo: string) {
    super(`Ya existe una charola con el código "${codigo}" en este Lote.`);
  }
}

/** Alta de charolas (5.2): cada charola se identifica individualmente dentro de su Lote. */
export async function agregarCharolas(loteId: string, codigos: string[]) {
  try {
    await prisma.viveroCharola.createMany({ data: codigos.map((codigo) => ({ loteId, codigo })) });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      throw new CodigoCharolaDuplicadoError(codigos.join(", "));
    }
    throw err;
  }
  return prisma.viveroCharola.findMany({ where: { loteId } });
}

/** Conteo de MUERTAS por charola individual (5.6) — VIVAS se calcula sola (cavidades del tipo de charola − muertas), no se persiste. */
export function capturarMuertas(charolaId: string, muertas: number, fecha: string) {
  return prisma.viveroCharola.update({ where: { id: charolaId }, data: { muertas, fechaConteo: new Date(fecha) } });
}

export interface SobrevivenciaVariedad {
  variedad: string;
  cavidadesTotales: number;
  vivas: number;
  muertas: number;
  porcentajeSobrevivencia: number;
}

/** Reporte agregado por Variedad (5.6): % real de sobrevivencia, sumando las charolas de esa variedad a través de todos sus Lotes. */
export async function reporteSobrevivenciaPorCiclo(cicloId: string): Promise<SobrevivenciaVariedad[]> {
  const ciclo = await prisma.ciclo.findUniqueOrThrow({ where: { id: cicloId } });
  const cavidadesPorCharola = ciclo.cavidadesPorCharola ?? 0;
  const lotes = await prisma.viveroLote.findMany({ where: { cicloId }, include: { charolas: true } });

  const porVariedad = new Map<string, { cavidadesTotales: number; muertas: number }>();
  for (const lote of lotes) {
    const acc = porVariedad.get(lote.variedad) ?? { cavidadesTotales: 0, muertas: 0 };
    acc.cavidadesTotales += lote.charolas.length * cavidadesPorCharola;
    acc.muertas += lote.charolas.reduce((s, c) => s + c.muertas, 0);
    porVariedad.set(lote.variedad, acc);
  }

  return [...porVariedad.entries()].map(([variedad, { cavidadesTotales, muertas }]) => ({
    variedad,
    cavidadesTotales,
    vivas: cavidadesTotales - muertas,
    muertas,
    porcentajeSobrevivencia: cavidadesTotales > 0 ? ((cavidadesTotales - muertas) / cavidadesTotales) * 100 : 0,
  }));
}

/** Riego en vivero (5.4) — sin cálculo de litros por ahora, solo se registra que se riega. */
export function registrarRiegoVivero(loteId: string, fecha: string, capturadoPorId: string) {
  return prisma.viveroRiego.upsert({
    where: { loteId_fecha: { loteId, fecha: new Date(fecha) } },
    update: {},
    create: { loteId, fecha: new Date(fecha), capturadoPorId },
  });
}

export interface CrearTraspasoInput {
  loteId: string;
  cantidadCharolas: number;
  huertaId: string;
  cuadroId?: string;
  fecha: string;
}

/** Traspaso a campo (5.7): se registra cuántas charolas de qué Lote se mandaron a qué Huerta/Cuadro. La decisión de resembrar es MANUAL. */
export function crearTraspaso(input: CrearTraspasoInput, capturadoPorId: string) {
  return prisma.viveroTraspaso.create({
    data: {
      loteId: input.loteId,
      cantidadCharolas: input.cantidadCharolas,
      huertaId: input.huertaId,
      cuadroId: input.cuadroId,
      fecha: new Date(input.fecha),
      capturadoPorId,
    },
  });
}

export function listarTraspasos(loteId: string) {
  return prisma.viveroTraspaso.findMany({ where: { loteId }, include: { conteos: true, huerta: true, cuadro: true }, orderBy: { fecha: "desc" } });
}

/** Conteo en campo posterior al traspaso (5.7): cuántas plantas prendieron/murieron, ligado al Lote de origen vía el Traspaso. */
export function registrarConteoCampo(traspasoId: string, prendieron: number, murieron: number, fecha: string, capturadoPorId: string) {
  return prisma.viveroConteoCampo.create({ data: { traspasoId, prendieron, murieron, fecha: new Date(fecha), capturadoPorId } });
}

/**
 * Presupuesto de semilla por Ciclo/Variedad (5.1): de aquí se genera el
 * pedido de semilla — mismo mecanismo que Fertilización Granular (9.5):
 * si alcanza el Almacén se aparta de inmediato, si no, se manda automático
 * a Compras sin requerir autorización adicional.
 */
export async function crearPresupuestoSemilla(cicloId: string, variedad: string, productoId: string, cantidadNecesaria: number, creadoPorId: string) {
  return prisma.$transaction(async (tx) => {
    const presupuesto = await tx.viveroPresupuestoSemilla.create({
      data: { cicloId, variedad, productoId, cantidadNecesaria, creadoPorId },
    });

    const comprometido = await intentarComprometer(tx, productoId, cantidadNecesaria, presupuesto.id, creadoPorId);
    if (!comprometido) {
      const disponible = await stockTotalProductoTx(tx, productoId);
      const faltante = cantidadNecesaria - disponible;
      await tx.ordenCompra.create({
        data: {
          origen: "automatica",
          productoId,
          cantidadSolicitada: faltante,
          estado: "pendiente_cotizar",
          referenciaAplicacionId: presupuesto.id,
          creadoPorId,
        },
      });
    }
    return presupuesto;
  });
}

export function listarPresupuestoSemilla(cicloId: string) {
  return prisma.viveroPresupuestoSemilla.findMany({ where: { cicloId }, include: { producto: true }, orderBy: { fechaCreacion: "desc" } });
}
