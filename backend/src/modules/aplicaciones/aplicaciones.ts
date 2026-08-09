import { calcularCantidadTotal, tarifaEfectiva, type ConcentracionUnidad } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
import { productosAutorizados } from "../almacen/productos.js";
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

// La actividad de Nómina a la que se liga la mano de obra automática de una
// Aplicación (9.7/9.11) — "Fumigación" es la actividad confirmada del
// catálogo de las 12 vigentes que corresponde a agroquímicos.
const NOMBRE_ACTIVIDAD_APLICACION = "Fumigación";
const DIAS_VENCIMIENTO = 15;

export class ProductoNoAutorizadoAplicacionError extends Error {
  constructor() {
    super("Este producto no es un agroquímico autorizado — no se puede programar una aplicación con él.");
  }
}

export class TransicionAplicacionInvalidaError extends Error {
  constructor(esperado: string) {
    super(`Esta aplicación no está en estado "${esperado}".`);
  }
}

export class StockNoComprometidoError extends Error {
  constructor() {
    super("Todavía no hay suficiente stock apartado para esta aplicación — espera a que llegue la compra automática.");
  }
}

export interface ProgramarAplicacionInput {
  huertaId: string;
  cuadroIds: string[];
  productoId: string;
  recursoTipo: "gente" | "implemento";
  equipoId?: string;
  concentracionValor: number;
  concentracionUnidad: ConcentracionUnidad;
  litrosMezclaPorHa: number;
  fechaInicio: string;
  fechaFin: string;
}

/**
 * Paso 1, Programar (9.7): calcula la cantidad total, y si el Almacén
 * alcanza la aparta de inmediato ("comprometido"); si no alcanza, no
 * bloquea — genera automático una orden de Compras por el faltante, sin
 * requerir autorización adicional (ya la trae de quien programó).
 */
export async function programarAplicacion(input: ProgramarAplicacionInput, creadoPorId: string) {
  if (input.recursoTipo === "implemento" && !input.equipoId) {
    throw new Error("Falta el equipo — el recurso 'Con implemento' requiere elegir un equipo.");
  }
  if (input.cuadroIds.length === 0) {
    throw new Error("Elige al menos un Cuadro.");
  }
  const producto = await prisma.producto.findUniqueOrThrow({ where: { id: input.productoId } });
  if (producto.categoria !== "agroquimico" || !producto.autorizado) {
    throw new ProductoNoAutorizadoAplicacionError();
  }

  let hectareasTotales = 0;
  const fechaRef = new Date(input.fechaInicio);
  for (const cuadroId of input.cuadroIds) {
    const version = await obtenerVersionVigente(cuadroId, fechaRef);
    if (!version) throw new Error(`El Cuadro elegido no tiene una configuración vigente para la fecha de inicio.`);
    hectareasTotales += Number(version.hectareas);
  }

  const cantidadTotalCalculada = calcularCantidadTotal(
    input.concentracionValor,
    input.concentracionUnidad,
    input.litrosMezclaPorHa,
    hectareasTotales
  );

  return prisma.$transaction(async (tx) => {
    const aplicacion = await tx.aplicacion.create({
      data: {
        huertaId: input.huertaId,
        productoId: input.productoId,
        recursoTipo: input.recursoTipo,
        equipoId: input.recursoTipo === "implemento" ? input.equipoId : undefined,
        concentracionValor: input.concentracionValor,
        concentracionUnidad: input.concentracionUnidad,
        litrosMezclaPorHa: input.litrosMezclaPorHa,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        cantidadTotalCalculada,
        creadoPorId,
      },
    });
    await tx.aplicacionCuadro.createMany({
      data: input.cuadroIds.map((cuadroId) => ({ aplicacionId: aplicacion.id, cuadroId })),
    });

    const comprometido = await intentarComprometer(tx, input.productoId, cantidadTotalCalculada, aplicacion.id, creadoPorId);
    if (!comprometido) {
      const disponible = await stockTotalProductoTx(tx, input.productoId);
      const faltante = cantidadTotalCalculada - disponible;
      await tx.ordenCompra.create({
        data: {
          origen: "automatica",
          productoId: input.productoId,
          cantidadSolicitada: faltante,
          estado: "pendiente_cotizar",
          referenciaAplicacionId: aplicacion.id,
          creadoPorId,
        },
      });
    }
    return aplicacion;
  });
}

/**
 * La lista también trae `comprometido`/alertas, no solo el detalle — si no,
 * el botón "Confirmar entrega" del listado nunca aparecería (el campo
 * vendría `undefined` en vez de `true`) aunque la aplicación sí esté
 * comprometida; se descubrió probando la pantalla real con datos que
 * seguían en "programada" al momento de revisar la lista.
 */
export async function listarAplicaciones(huertaId?: string) {
  const aplicaciones = await prisma.aplicacion.findMany({
    where: { huertaId },
    include: { huerta: true, producto: true, equipo: true, cuadros: { include: { cuadro: true } }, realizadas: true },
    orderBy: { fechaCreacion: "desc" },
  });
  return Promise.all(aplicaciones.map((a) => enriquecerConAlertas(a)));
}

async function enriquecerConAlertas<T extends { id: string; estado: string; fechaCreacion: Date }>(aplicacion: T, tx: TransactionClient | typeof prisma = prisma) {
  const comprometido = await tx.almacenCentralMovimiento.findFirst({
    where: { referenciaId: aplicacion.id, tipo: "salida_comprometida" },
  });
  const entrega = await tx.almacenCentralMovimiento.findFirst({
    where: { referenciaId: aplicacion.id, tipo: "salida_real" },
  });
  const diasSinEntregar = aplicacion.estado === "programada" ? Math.floor((Date.now() - aplicacion.fechaCreacion.getTime()) / 86_400_000) : null;
  const diasSinAplicar = aplicacion.estado === "entregada" && entrega ? Math.floor((Date.now() - entrega.fecha.getTime()) / 86_400_000) : null;

  return {
    ...aplicacion,
    comprometido: !!comprometido,
    diasSinEntregar,
    alertaVencimiento: (diasSinEntregar ?? 0) > DIAS_VENCIMIENTO,
    diasSinAplicar,
    alertaPendienteAplicar: (diasSinAplicar ?? 0) > DIAS_VENCIMIENTO,
  };
}

export async function obtenerAplicacion(id: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({
    where: { id },
    include: { huerta: true, producto: true, equipo: true, cuadros: { include: { cuadro: true } }, realizadas: true },
  });
  return enriquecerConAlertas(aplicacion);
}

/**
 * Confirma la entrega física del producto a la Huerta (9.7) — acción de
 * Almacén, no de quien programó. Solo puede pasar si ya hay stock
 * comprometido para esta aplicación.
 */
export async function confirmarEntrega(aplicacionId: string, capturadoPorId: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId } });
  if (aplicacion.estado !== "programada") throw new TransicionAplicacionInvalidaError("programada");

  return prisma.$transaction(async (tx) => {
    const comprometido = await tx.almacenCentralMovimiento.findFirst({
      where: { referenciaId: aplicacionId, tipo: "salida_comprometida" },
    });
    if (!comprometido) throw new StockNoComprometidoError();

    await confirmarEntregaComprometida(
      tx,
      aplicacion.productoId,
      aplicacion.huertaId,
      Number(aplicacion.cantidadTotalCalculada),
      aplicacionId,
      capturadoPorId
    );
    return tx.aplicacion.update({ where: { id: aplicacionId }, data: { estado: "entregada" } });
  });
}

export interface RegistrarRealizadaInput {
  personalId?: string;
  grupoId?: string;
  horas: number;
  fechaReal: string;
}

/**
 * Paso 2, Registrar como realizada (9.7) — solo después de la entrega.
 * Genera el registro real de mano de obra en Nómina y, la primera vez,
 * descuenta automático del Almacén Local (una aplicación casi nunca se
 * hace en un solo día, así que puede haber varios reportes de horas —
 * pero el producto ya se dio por consumido completo desde el primero).
 */
export async function registrarRealizada(aplicacionId: string, input: RegistrarRealizadaInput, registradoPorId: string) {
  if (!input.personalId && !input.grupoId) throw new Error("Falta quién hizo la aplicación (persona o grupo).");

  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId }, include: { cuadros: true } });
  if (aplicacion.estado !== "entregada" && aplicacion.estado !== "realizada") {
    throw new Error(
      "No se ha entregado el producto a esta Huerta todavía — Almacén debe confirmar la entrega antes de registrar la aplicación como realizada."
    );
  }

  const actividad = await prisma.actividad.findFirstOrThrow({ where: { nombre: NOMBRE_ACTIVIDAD_APLICACION } });
  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
  const esPrimeraVezRealizada = aplicacion.estado === "entregada";

  return prisma.$transaction(async (tx) => {
    const realizada = await tx.aplicacionRealizada.create({
      data: {
        aplicacionId,
        personalId: input.personalId,
        grupoId: input.grupoId,
        horas: input.horas,
        fechaReal: new Date(input.fechaReal),
        registradoPorId,
      },
    });

    await tx.registroNomina.create({
      data: {
        fecha: new Date(input.fechaReal),
        huertaId: aplicacion.huertaId,
        cuadroId: aplicacion.cuadros.length === 1 ? aplicacion.cuadros[0]!.cuadroId : undefined,
        personalId: input.personalId,
        grupoId: input.grupoId,
        actividadId: actividad.id,
        cantidad: input.horas,
        tarifaAplicada,
        origen: "automatico_aplicacion",
        referenciaOrigenId: realizada.id,
        capturadoPorId: registradoPorId,
      },
    });

    if (esPrimeraVezRealizada) {
      await tx.aplicacion.update({ where: { id: aplicacionId }, data: { estado: "realizada" } });
      const cantidad = Number(aplicacion.cantidadTotalCalculada);
      const local = await tx.almacenLocal.upsert({
        where: { huertaId_productoId: { huertaId: aplicacion.huertaId, productoId: aplicacion.productoId } },
        update: { cantidadReportadaAcumulada: { increment: cantidad } },
        create: { huertaId: aplicacion.huertaId, productoId: aplicacion.productoId, cantidadReportadaAcumulada: cantidad },
      });
      await tx.almacenLocalMovimiento.create({
        data: { almacenLocalId: local.id, tipo: "consumo_reportado", cantidad, referenciaId: aplicacionId, capturadoPorId: registradoPorId },
      });
    }

    return realizada;
  });
}

/**
 * Cierra una aplicación programada que nunca se entregó — ya sea porque
 * pasaron los 15 días de vencimiento (9.7) o por cancelación manual de
 * Dirección/Gerencia Técnica. Libera el stock comprometido si lo había.
 */
export async function liberarAplicacionVencida(aplicacionId: string, capturadoPorId: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId } });
  if (aplicacion.estado !== "programada") throw new TransicionAplicacionInvalidaError("programada");

  return prisma.$transaction(async (tx) => {
    const comprometido = await tx.almacenCentralMovimiento.findFirst({
      where: { referenciaId: aplicacionId, tipo: "salida_comprometida" },
    });
    if (comprometido) {
      await liberarComprometido(
        tx,
        aplicacion.productoId,
        Number(aplicacion.cantidadTotalCalculada),
        aplicacionId,
        capturadoPorId,
        "Liberación de aplicación vencida (15 días sin entregar) o cancelada manualmente."
      );
    }
    return tx.aplicacion.update({ where: { id: aplicacionId }, data: { estado: "vencida" } });
  });
}

/** Catálogo de agroquímicos ya autorizados — lo único elegible al programar (9.7). */
export function productosParaAplicacion() {
  return productosAutorizados("agroquimico");
}

/** Implementos elegibles cuando el recurso es "Con implemento" (9.7/9.13). */
export function equiposImplementoParaAplicacion() {
  return listarEquipos("implemento");
}

/**
 * Grupos de pago de una Huerta, para el selector "quién la hizo" al
 * registrar una aplicación como realizada — expuesto aquí en vez de
 * reutilizar el endpoint de Nómina porque Supervisor/Ayudante de
 * Supervisor no tienen permiso sobre el módulo "nomina" en absoluto.
 */
export function gruposParaAplicacion(huertaId: string) {
  return prisma.grupoPago.findMany({ where: { huertaId }, orderBy: { nombre: "asc" } });
}
