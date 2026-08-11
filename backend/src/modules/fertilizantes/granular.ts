import { calcularCantidadTotalGranular, plantasTotalesCuadro, tarifaEfectiva, type ModoDosisGranular } from "@cbf/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../core/db.js";
import {
  confirmarEntregaComprometida,
  intentarComprometer,
  liberarComprometido,
  stockTotalProductoTx,
} from "../almacen/movimientos.js";
import { listarEquipos } from "../equipos/equipos.js";
import { obtenerVersionVigente } from "../unidades-produccion/cuadros.js";
import { obtenerConfigNomina } from "../nomina/config.js";
import { aActividadCalc } from "../nomina/util.js";
import { diaEstaCerrado } from "../nomina/captura.js";

// Actividad de Nómina para la mano de obra automática de Fertilización
// Granular (9.5/9.11) — decisión explícita del usuario: ninguna de las 12
// actividades confirmadas originalmente representaba esto, se agregó
// "Fertilización" al catálogo con el mismo esquema que las demás.
const NOMBRE_ACTIVIDAD_GRANULAR = "Fertilización";
const DIAS_VENCIMIENTO = 15;

export class ProductoNoAutorizadoFertilizanteError extends Error {
  constructor() {
    super("Este producto no es un fertilizante autorizado — no se puede programar una fertilización con él.");
  }
}

export class TransicionFertilizacionInvalidaError extends Error {
  constructor(esperado: string) {
    super(`Esta fertilización no está en estado "${esperado}".`);
  }
}

export class StockNoComprometidoError extends Error {
  constructor() {
    super("Todavía no hay suficiente stock apartado para esta fertilización — espera a que llegue la compra automática.");
  }
}

export class SuperficieExcedeCuadroReporteError extends Error {
  constructor(nombreCuadro: string, hectareasCuadro: number, hectareasAcumuladas: number) {
    super(
      `El Cuadro "${nombreCuadro}" tiene ${hectareasCuadro} ha, pero entre todos los reportes de esta fertilización se acumularían ${hectareasAcumuladas.toFixed(4)} ha — la suma no puede exceder la superficie del Cuadro.`
    );
  }
}

export class DiaCerradoFertilizacionError extends Error {
  constructor() {
    super("La Huerta ya tiene cerrado el día de Nómina de este reporte — no se puede editar (candado de consistencia con Nómina).");
  }
}

export class NoSePuedeCancelarError extends Error {
  constructor(motivo: string) {
    super(motivo);
  }
}

export interface ProgramarGranularInput {
  huertaId: string;
  cuadroIds: string[];
  productoId: string;
  recursoTipo: "gente" | "implemento";
  equipoId?: string;
  modoDosis: ModoDosisGranular;
  dosisValor: number;
  fechaInicio: string;
  fechaFin: string;
}

/**
 * Paso 1, Programar — Camino 1 Granular (9.5, mismo patrón que Aplicaciones
 * 9.7): kg/ha usa hectáreas totales; g/planta usa el total de plantas del
 * Marco de Plantación de cada Cuadro. Aparta stock de inmediato si alcanza;
 * si no, genera automático una orden de Compras por el faltante.
 */
export async function programarGranular(input: ProgramarGranularInput, creadoPorId: string) {
  if (input.recursoTipo === "implemento" && !input.equipoId) {
    throw new Error("Falta el equipo — el recurso 'Con implemento' requiere elegir un equipo.");
  }
  if (input.cuadroIds.length === 0) {
    throw new Error("Elige al menos un Cuadro.");
  }
  const producto = await prisma.producto.findUniqueOrThrow({ where: { id: input.productoId } });
  if (producto.categoria !== "fertilizante" || !producto.autorizado) {
    throw new ProductoNoAutorizadoFertilizanteError();
  }

  let hectareasTotales = 0;
  let plantasTotales = 0;
  const fechaRef = new Date(input.fechaInicio);
  for (const cuadroId of input.cuadroIds) {
    const version = await obtenerVersionVigente(cuadroId, fechaRef);
    if (!version) throw new Error("El Cuadro elegido no tiene una configuración vigente para la fecha de inicio.");
    hectareasTotales += Number(version.hectareas);
    if (input.modoDosis === "g_planta") {
      if (!version.distSurcosM || !version.distPlantasM) {
        throw new Error("El Cuadro elegido no tiene Marco de Plantación configurado — no se puede calcular g/planta.");
      }
      plantasTotales += plantasTotalesCuadro(Number(version.hectareas), Number(version.distSurcosM), Number(version.distPlantasM));
    }
  }

  const cantidadTotalCalculada = calcularCantidadTotalGranular(input.modoDosis, input.dosisValor, hectareasTotales, plantasTotales);

  return prisma.$transaction(async (tx) => {
    const fertilizacion = await tx.fertilizacionGranular.create({
      data: {
        huertaId: input.huertaId,
        productoId: input.productoId,
        recursoTipo: input.recursoTipo,
        equipoId: input.recursoTipo === "implemento" ? input.equipoId : undefined,
        modoDosis: input.modoDosis,
        dosisValor: input.dosisValor,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        cantidadTotalCalculada,
        hectareasTotalesProgramadas: hectareasTotales,
        creadoPorId,
      },
    });
    await tx.fertilizacionGranularCuadro.createMany({
      data: input.cuadroIds.map((cuadroId) => ({ fertilizacionId: fertilizacion.id, cuadroId })),
    });

    const comprometido = await intentarComprometer(tx, input.productoId, cantidadTotalCalculada, fertilizacion.id, creadoPorId);
    if (!comprometido) {
      const disponible = await stockTotalProductoTx(tx, input.productoId);
      const faltante = cantidadTotalCalculada - disponible;
      await tx.ordenCompra.create({
        data: {
          origen: "automatica",
          productoId: input.productoId,
          cantidadSolicitada: faltante,
          estado: "pendiente_cotizar",
          referenciaAplicacionId: fertilizacion.id,
          creadoPorId,
        },
      });
    }
    return fertilizacion;
  });
}

const INCLUDE_GRANULAR = {
  huerta: true,
  producto: true,
  equipo: true,
  cuadros: { include: { cuadro: true } },
  realizadas: { include: { cuadros: { include: { cuadro: true } } }, orderBy: { fechaReal: "desc" as const } },
};

type GranularConRealizadas = {
  id: string;
  estado: string;
  fechaCreacion: Date;
  hectareasTotalesProgramadas: Prisma.Decimal;
  realizadas: { cuadros: { hectareas: Prisma.Decimal }[]; horas: Prisma.Decimal }[];
};

async function enriquecerConAlertas<T extends GranularConRealizadas>(fertilizacion: T) {
  const comprometido = await prisma.almacenCentralMovimiento.findFirst({
    where: { referenciaId: fertilizacion.id, tipo: "salida_comprometida" },
  });
  const entrega = await prisma.almacenCentralMovimiento.findFirst({ where: { referenciaId: fertilizacion.id, tipo: "salida_real" } });
  const diasSinEntregar = fertilizacion.estado === "programada" ? Math.floor((Date.now() - fertilizacion.fechaCreacion.getTime()) / 86_400_000) : null;
  const diasSinAplicar =
    (fertilizacion.estado === "entregada" || fertilizacion.estado === "realizada") && entrega
      ? Math.floor((Date.now() - entrega.fecha.getTime()) / 86_400_000)
      : null;

  const hectareasAvanzadas = fertilizacion.realizadas.reduce((s, r) => s + r.cuadros.reduce((s2, c) => s2 + Number(c.hectareas), 0), 0);
  const horasHombreTotales = fertilizacion.realizadas.reduce((s, r) => s + Number(r.horas), 0);
  const porcentajeAvance =
    Number(fertilizacion.hectareasTotalesProgramadas) > 0 ? (hectareasAvanzadas / Number(fertilizacion.hectareasTotalesProgramadas)) * 100 : 0;

  return {
    ...fertilizacion,
    comprometido: !!comprometido,
    diasSinEntregar,
    alertaVencimiento: (diasSinEntregar ?? 0) > DIAS_VENCIMIENTO,
    diasSinAplicar,
    alertaPendienteAplicar: (diasSinAplicar ?? 0) > DIAS_VENCIMIENTO && porcentajeAvance < 100,
    hectareasAvanzadas,
    horasHombreTotales,
    porcentajeAvance,
  };
}

/**
 * La lista también trae `comprometido`/alertas, no solo el detalle — si no,
 * el botón "Confirmar entrega" del listado nunca aparecería (ver mismo
 * ajuste en Aplicaciones, encontrado probando la pantalla real).
 */
export async function listarGranular(huertaId?: string) {
  const fertilizaciones = await prisma.fertilizacionGranular.findMany({
    where: { huertaId },
    include: INCLUDE_GRANULAR,
    orderBy: { fechaCreacion: "desc" },
  });
  return Promise.all(fertilizaciones.map((f) => enriquecerConAlertas(f)));
}

export async function obtenerGranular(id: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({
    where: { id },
    include: INCLUDE_GRANULAR,
  });
  return enriquecerConAlertas(fertilizacion);
}

/** Confirma la entrega física — acción de Almacén (Bodega), no de quien programó. */
export async function confirmarEntregaGranular(id: string, capturadoPorId: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id } });
  if (fertilizacion.estado !== "programada") throw new TransicionFertilizacionInvalidaError("programada");

  return prisma.$transaction(async (tx) => {
    const comprometido = await tx.almacenCentralMovimiento.findFirst({ where: { referenciaId: id, tipo: "salida_comprometida" } });
    if (!comprometido) throw new StockNoComprometidoError();

    await confirmarEntregaComprometida(
      tx,
      fertilizacion.productoId,
      fertilizacion.huertaId,
      Number(fertilizacion.cantidadTotalCalculada),
      id,
      capturadoPorId
    );
    return tx.fertilizacionGranular.update({ where: { id }, data: { estado: "entregada" } });
  });
}

export interface CuadroAvanceInput {
  cuadroId: string;
  hectareas: number;
}

export interface RegistrarRealizadaGranularInput {
  personalId?: string;
  grupoId?: string;
  horas: number;
  fechaReal: string;
  cuadros: CuadroAvanceInput[];
  casoExtraordinario?: boolean;
}

export class DiaCerradoRequiereCasoExtraordinarioError extends Error {
  constructor() {
    super(
      "La Huerta ya tiene cerrado el día de Nómina de esta fecha — para que este registro cuente, se necesita autorización de caso extraordinario (Encargado de Nóminas, Director General o Gerente Administrativo)."
    );
  }
}

/** Mismo candado de superficie por Cuadro que Aplicaciones (9.7/9.5) — ver detalle allá. */
async function validarCandadoCuadrosReporte(fertilizacionId: string, cuadros: CuadroAvanceInput[], excluirRealizadaId?: string) {
  for (const c of cuadros) {
    const yaReportadas = await prisma.fertilizacionGranularRealizadaCuadro.aggregate({
      _sum: { hectareas: true },
      where: {
        cuadroId: c.cuadroId,
        realizada: { fertilizacionId, ...(excluirRealizadaId ? { id: { not: excluirRealizadaId } } : {}) },
      },
    });
    const acumuladas = Number(yaReportadas._sum.hectareas ?? 0) + c.hectareas;
    const version = await obtenerVersionVigente(c.cuadroId);
    if (version && acumuladas > Number(version.hectareas) + 0.0001) {
      const cuadro = await prisma.cuadro.findUnique({ where: { id: c.cuadroId } });
      throw new SuperficieExcedeCuadroReporteError(cuadro?.nombre ?? c.cuadroId, Number(version.hectareas), acumuladas);
    }
  }
}

/**
 * Paso 2, Registrar como realizada (Supervisor) — solo después de entregada.
 * Mismo rediseño que Aplicaciones (9.7/9.5): captura Cuadro(s)+hectáreas por
 * reporte, con descuento proporcional del Almacén Local en cada reporte
 * (pendiente de confirmar en pruebas reales de este módulo específico al
 * momento de documentarse, ver historial).
 */
export async function registrarRealizadaGranular(id: string, input: RegistrarRealizadaGranularInput, registradoPorId: string) {
  if (!input.personalId && !input.grupoId) throw new Error("Falta quién hizo la fertilización (persona o grupo).");
  if (!input.cuadros || input.cuadros.length === 0) throw new Error("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");

  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id }, include: { cuadros: true } });
  if (fertilizacion.estado !== "entregada" && fertilizacion.estado !== "realizada") {
    throw new Error(
      "No se ha entregado el producto a esta Huerta todavía — Almacén debe confirmar la entrega antes de registrar la fertilización como realizada."
    );
  }
  const cuadroIdsProgramados = new Set(fertilizacion.cuadros.map((c) => c.cuadroId));
  for (const c of input.cuadros) {
    if (!cuadroIdsProgramados.has(c.cuadroId)) throw new Error("Uno de los Cuadros reportados no forma parte de esta fertilización.");
  }
  await validarCandadoCuadrosReporte(id, input.cuadros);

  // Registro automático llegando después del cierre del día (9.11): no entra solo — exige caso extraordinario ya autorizado por el llamador (verificado en la ruta).
  if ((await diaEstaCerrado(fertilizacion.huertaId, input.fechaReal)) && !input.casoExtraordinario) {
    throw new DiaCerradoRequiereCasoExtraordinarioError();
  }

  const actividad = await prisma.actividad.findFirstOrThrow({ where: { nombre: NOMBRE_ACTIVIDAD_GRANULAR } });
  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
  const esPrimeraVezRealizada = fertilizacion.estado === "entregada";

  const hectareasEsteReporte = input.cuadros.reduce((s, c) => s + c.hectareas, 0);
  const cantidadEsteReporte = (hectareasEsteReporte / Number(fertilizacion.hectareasTotalesProgramadas)) * Number(fertilizacion.cantidadTotalCalculada);

  return prisma.$transaction(async (tx) => {
    const realizada = await tx.fertilizacionGranularRealizada.create({
      data: {
        fertilizacionId: id,
        personalId: input.personalId,
        grupoId: input.grupoId,
        horas: input.horas,
        fechaReal: new Date(input.fechaReal),
        registradoPorId,
        cuadros: { create: input.cuadros.map((c) => ({ cuadroId: c.cuadroId, hectareas: c.hectareas })) },
      },
      include: { cuadros: true },
    });

    await tx.registroNomina.create({
      data: {
        fecha: new Date(input.fechaReal),
        huertaId: fertilizacion.huertaId,
        cuadroId: input.cuadros.length === 1 ? input.cuadros[0]!.cuadroId : undefined,
        personalId: input.personalId,
        grupoId: input.grupoId,
        actividadId: actividad.id,
        cantidad: input.horas,
        tarifaAplicada,
        origen: "automatico_fertilizacion",
        referenciaOrigenId: realizada.id,
        capturadoPorId: registradoPorId,
      },
    });

    if (esPrimeraVezRealizada) {
      await tx.fertilizacionGranular.update({ where: { id }, data: { estado: "realizada" } });
    }

    const local = await tx.almacenLocal.upsert({
      where: { huertaId_productoId: { huertaId: fertilizacion.huertaId, productoId: fertilizacion.productoId } },
      update: { cantidadReportadaAcumulada: { increment: cantidadEsteReporte } },
      create: { huertaId: fertilizacion.huertaId, productoId: fertilizacion.productoId, cantidadReportadaAcumulada: cantidadEsteReporte },
    });
    await tx.almacenLocalMovimiento.create({
      data: { almacenLocalId: local.id, tipo: "consumo_reportado", cantidad: cantidadEsteReporte, referenciaId: id, capturadoPorId: registradoPorId },
    });

    return realizada;
  });
}

export interface EditarRealizadaGranularInput {
  personalId?: string;
  grupoId?: string;
  horas: number;
  cuadros: CuadroAvanceInput[];
}

/** Historial de reportes editable por separado, sujeto al mismo candado de consistencia con Nómina que Aplicaciones (9.5/9.7/9.11). */
export async function editarRealizadaGranular(realizadaId: string, input: EditarRealizadaGranularInput, editadoPorId: string) {
  if (!input.personalId && !input.grupoId) throw new Error("Falta quién hizo la fertilización (persona o grupo).");
  if (!input.cuadros || input.cuadros.length === 0) throw new Error("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");

  const realizada = await prisma.fertilizacionGranularRealizada.findUniqueOrThrow({
    where: { id: realizadaId },
    include: { fertilizacion: { include: { cuadros: true } }, cuadros: true },
  });
  const fechaISO = realizada.fechaReal.toISOString().slice(0, 10);
  if (await diaEstaCerrado(realizada.fertilizacion.huertaId, fechaISO)) throw new DiaCerradoFertilizacionError();

  const cuadroIdsProgramados = new Set(realizada.fertilizacion.cuadros.map((c) => c.cuadroId));
  for (const c of input.cuadros) {
    if (!cuadroIdsProgramados.has(c.cuadroId)) throw new Error("Uno de los Cuadros reportados no forma parte de esta fertilización.");
  }
  await validarCandadoCuadrosReporte(realizada.fertilizacionId, input.cuadros, realizadaId);

  const fertilizacion = realizada.fertilizacion;
  const hectareasAntes = realizada.cuadros.reduce((s, c) => s + Number(c.hectareas), 0);
  const hectareasDespues = input.cuadros.reduce((s, c) => s + c.hectareas, 0);
  const base = Number(fertilizacion.hectareasTotalesProgramadas);
  const cantidadAntes = (hectareasAntes / base) * Number(fertilizacion.cantidadTotalCalculada);
  const cantidadDespues = (hectareasDespues / base) * Number(fertilizacion.cantidadTotalCalculada);
  const delta = cantidadDespues - cantidadAntes;

  return prisma.$transaction(async (tx) => {
    await tx.fertilizacionGranularRealizadaCuadro.deleteMany({ where: { realizadaId } });
    await tx.fertilizacionGranularRealizadaCuadro.createMany({
      data: input.cuadros.map((c) => ({ realizadaId, cuadroId: c.cuadroId, hectareas: c.hectareas })),
    });
    await tx.fertilizacionGranularRealizada.update({
      where: { id: realizadaId },
      data: { personalId: input.personalId, grupoId: input.grupoId, horas: input.horas },
    });
    await tx.registroNomina.updateMany({
      where: { origen: "automatico_fertilizacion", referenciaOrigenId: realizadaId },
      data: {
        cantidad: input.horas,
        personalId: input.personalId,
        grupoId: input.grupoId,
        cuadroId: input.cuadros.length === 1 ? input.cuadros[0]!.cuadroId : null,
      },
    });

    if (Math.abs(delta) > 0.0000001) {
      const local = await tx.almacenLocal.upsert({
        where: { huertaId_productoId: { huertaId: fertilizacion.huertaId, productoId: fertilizacion.productoId } },
        update: { cantidadReportadaAcumulada: { increment: delta } },
        create: { huertaId: fertilizacion.huertaId, productoId: fertilizacion.productoId, cantidadReportadaAcumulada: delta },
      });
      await tx.almacenLocalMovimiento.create({
        data: {
          almacenLocalId: local.id,
          tipo: "ajuste_manual",
          cantidad: delta,
          referenciaId: fertilizacion.id,
          capturadoPorId: editadoPorId,
        },
      });
    }

    return tx.fertilizacionGranularRealizada.findUniqueOrThrow({ where: { id: realizadaId }, include: { cuadros: true } });
  });
}

/**
 * Cierra una fertilización programada que nunca se entregó (vencida a 15
 * días, o cancelación manual). Solo aplica al caso "nunca salió de bodega"
 * — si ya se entregó al rancho, ver `cancelarGranularEntregada`.
 */
export async function liberarGranularVencida(id: string, capturadoPorId: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id } });
  if (fertilizacion.estado !== "programada") throw new TransicionFertilizacionInvalidaError("programada");

  return prisma.$transaction(async (tx) => {
    const comprometido = await tx.almacenCentralMovimiento.findFirst({ where: { referenciaId: id, tipo: "salida_comprometida" } });
    if (comprometido) {
      await liberarComprometido(
        tx,
        fertilizacion.productoId,
        Number(fertilizacion.cantidadTotalCalculada),
        id,
        capturadoPorId,
        "Liberación de fertilización granular vencida (15 días sin entregar) o cancelada manualmente."
      );
    }
    return tx.fertilizacionGranular.update({ where: { id }, data: { estado: "vencida" } });
  });
}

/** Protocolo de cancelación de fertilización granular entregada y vencida a 15 días — mismo mecanismo que Aplicaciones (9.7/9.5). */
export async function cancelarGranularEntregada(id: string, canceladaPorId: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id } });
  if (fertilizacion.estado !== "entregada" && fertilizacion.estado !== "realizada") {
    throw new NoSePuedeCancelarError("Solo se puede cancelar una fertilización que ya fue entregada al rancho.");
  }

  const entrega = await prisma.almacenCentralMovimiento.findFirst({ where: { referenciaId: id, tipo: "salida_real" } });
  if (!entrega) throw new NoSePuedeCancelarError("No se encontró la entrega de esta fertilización.");
  const diasSinAplicar = Math.floor((Date.now() - entrega.fecha.getTime()) / 86_400_000);
  if (diasSinAplicar <= DIAS_VENCIMIENTO) {
    throw new NoSePuedeCancelarError(`Todavía no pasan los ${DIAS_VENCIMIENTO} días desde la entrega — lleva ${diasSinAplicar}.`);
  }

  const avanzadas = await prisma.fertilizacionGranularRealizadaCuadro.aggregate({
    _sum: { hectareas: true },
    where: { realizada: { fertilizacionId: id } },
  });
  const hectareasAvanzadas = Number(avanzadas._sum.hectareas ?? 0);
  const porcentajeAvance = hectareasAvanzadas / Number(fertilizacion.hectareasTotalesProgramadas);
  if (porcentajeAvance >= 0.9999) {
    throw new NoSePuedeCancelarError("Esta fertilización ya quedó completamente aplicada — no hay nada que cancelar.");
  }

  const cantidadARegresar = Number(fertilizacion.cantidadTotalCalculada) * (1 - porcentajeAvance);

  return prisma.$transaction(async (tx) => {
    const local = await tx.almacenLocal.update({
      where: { huertaId_productoId: { huertaId: fertilizacion.huertaId, productoId: fertilizacion.productoId } },
      data: { cantidadRecibidaAcumulada: { decrement: cantidadARegresar } },
    });
    await tx.almacenLocalMovimiento.create({
      data: {
        almacenLocalId: local.id,
        tipo: "ajuste_manual",
        cantidad: -cantidadARegresar,
        referenciaId: id,
        capturadoPorId: canceladaPorId,
      },
    });

    const lote = await tx.productoLote.findFirst({ where: { productoId: fertilizacion.productoId } });
    if (lote) {
      await tx.productoLote.update({ where: { id: lote.id }, data: { cantidadActual: { increment: cantidadARegresar } } });
    } else {
      await tx.productoLote.create({ data: { productoId: fertilizacion.productoId, lote: "ABONO", cantidadActual: cantidadARegresar } });
    }
    await tx.almacenCentralMovimiento.create({
      data: {
        productoId: fertilizacion.productoId,
        tipo: "abono_sobrante",
        cantidad: cantidadARegresar,
        huertaDestinoId: fertilizacion.huertaId,
        referenciaId: id,
        capturadoPorId: canceladaPorId,
      },
    });

    return tx.fertilizacionGranular.update({
      where: { id },
      data: { estado: "cancelada", canceladaPorId, fechaCancelacion: new Date() },
    });
  });
}

/** Firma digital de recepción del Encargado de Bodega — confirma que el producto devuelto ya llegó físicamente. */
export async function confirmarRecepcionCancelacionGranular(id: string, confirmadoPorId: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id } });
  if (fertilizacion.estado !== "cancelada") {
    throw new NoSePuedeCancelarError("Esta fertilización no está cancelada — no hay nada que confirmar.");
  }
  if (fertilizacion.confirmacionBodegaPorId) {
    throw new NoSePuedeCancelarError("Ya se había confirmado la recepción de esta cancelación.");
  }
  return prisma.fertilizacionGranular.update({
    where: { id },
    data: { confirmacionBodegaPorId: confirmadoPorId, fechaConfirmacionBodega: new Date() },
  });
}

/** Catálogo de fertilizantes ya autorizados — lo único elegible al programar (9.5). */
export function productosParaFertilizacion() {
  return prisma.producto.findMany({ where: { categoria: "fertilizante", autorizado: true }, orderBy: { nombreComercial: "asc" } });
}

/** Implementos elegibles cuando el recurso es "Con implemento" (9.5/9.13). */
export function equiposImplementoParaFertilizacion() {
  return listarEquipos("implemento");
}

/** Grupos de pago (catálogo global — 9.11), para "quién la hizo" al registrar realizada. */
export function gruposParaFertilizacion() {
  return prisma.grupoPago.findMany({ orderBy: { nombre: "asc" } });
}
