import { calcularPeriodoNomina, type FechaISO } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";
import { gananciaDestajoEnRango } from "./captura.js";
import { calcularBonoParaPersona } from "./bonos.js";
import { aplicarDescuento } from "./prestamos.js";
import { detalleActividadesPersonaEnPeriodo } from "./detalle.js";
import { generarPdfSobres } from "./sobre.js";
import type { FilaReporteSemanal } from "./reporte.js";

export class PersonaNoEsDestajoError extends Error {
  constructor() {
    super("Las liquidaciones fuera de ciclo solo aplican a personal eventual/destajo — la nómina fija sigue su ciclo semanal normal.");
  }
}

export interface PrestamoPendienteLiquidacion {
  prestamoId: string;
  motivo: string;
  saldoPendiente: number;
  montoSugerido: number;
}

export interface LiquidacionCalculada {
  personalId: string;
  nombreCompleto: string;
  bruto: number;
  bonos: number;
  neto: number;
  prestamosPendientes: PrestamoPendienteLiquidacion[];
}

/**
 * Default del rango de una Liquidación (9.11, 15-ago-2026): día siguiente
 * al último cierre de Nómina a nivel EMPRESA (no por Huerta, una persona
 * puede haber trabajado en varias) hasta hoy — editable en la pantalla si
 * hace falta ajustar al último día trabajado real.
 */
export async function rangoDefaultLiquidacion(hoy: FechaISO): Promise<{ fechaInicio: FechaISO; fechaFin: FechaISO }> {
  const config = await obtenerConfigNomina();
  const periodo = calcularPeriodoNomina(hoy, config.diaCorteIndex);
  return { fechaInicio: periodo.inicio, fechaFin: hoy };
}

/**
 * Cálculo sin persistir (9.11) — mismas fórmulas que el reporte semanal
 * normal (gananciaDestajoEnRango, calcularBonoParaPersona por cada plantilla
 * activa, evaluada con `fechaFin` como referencia), pero sobre el rango
 * corto de la liquidación. Los préstamos pendientes solo se listan para
 * avisar — nunca se descuentan aquí; eso requiere confirmación explícita
 * en `crearLiquidacion`.
 */
export async function calcularLiquidacion(personalId: string, fechaInicio: FechaISO, fechaFin: FechaISO): Promise<LiquidacionCalculada> {
  const persona = await prisma.personal.findUniqueOrThrow({ where: { id: personalId } });
  if (persona.tipo !== "destajo") throw new PersonaNoEsDestajoError();

  const bruto = await gananciaDestajoEnRango(personalId, fechaInicio, fechaFin);

  const bonosActivos = await prisma.bonoConfig.findMany({ where: { activo: true } });
  let bonos = 0;
  for (const bono of bonosActivos) {
    bonos += await calcularBonoParaPersona(bono.id, personalId, fechaFin);
  }

  const prestamos = await prisma.prestamo.findMany({ where: { personalId, activo: true } });
  const prestamosPendientes: PrestamoPendienteLiquidacion[] = prestamos
    .filter((p) => Number(p.saldoPendiente) > 0)
    .map((p) => ({
      prestamoId: p.id,
      motivo: p.motivo,
      saldoPendiente: Number(p.saldoPendiente),
      montoSugerido: Math.min(Number(p.montoPorDescuento), Number(p.saldoPendiente)),
    }));

  return { personalId, nombreCompleto: persona.nombreCompleto, bruto, bonos, neto: bruto + bonos, prestamosPendientes };
}

export interface CrearLiquidacionInput {
  personalId: string;
  fechaInicio: string;
  fechaFin: string;
  /** Préstamos que quien liquida confirmó explícitamente descontar — nunca automático (9.11). */
  prestamosADescontar: string[];
}

/**
 * Persiste la liquidación. No dispara Baja en RH (9.12 sigue siendo un paso
 * aparte, manual, con motivo obligatorio) — solo marca a la persona como no
 * disponible para Captura del día a partir del día siguiente al rango
 * liquidado, para que no se le pueda seguir capturando trabajo por error.
 * No afecta su Grupo de Pago — la liquidación es 100% individual.
 */
export async function crearLiquidacion(input: CrearLiquidacionInput, liquidadoPorId: string) {
  const calculo = await calcularLiquidacion(input.personalId, input.fechaInicio, input.fechaFin);

  let descuentoPrestamos = 0;
  // aplicarDescuento ya corre su propia transacción atómica por préstamo
  // (avanza saldoPendiente/proximoDescuento) — se aplica antes de crear el
  // registro de la liquidación, uno por uno, solo para los confirmados.
  for (const prestamoId of input.prestamosADescontar) {
    const info = calculo.prestamosPendientes.find((p) => p.prestamoId === prestamoId);
    if (!info) continue;
    await aplicarDescuento(prestamoId, liquidadoPorId, input.fechaFin);
    descuentoPrestamos += info.montoSugerido;
  }

  const neto = calculo.bruto + calculo.bonos - descuentoPrestamos;
  const diaSiguiente = new Date(input.fechaFin);
  diaSiguiente.setUTCDate(diaSiguiente.getUTCDate() + 1);

  return prisma.$transaction(async (tx) => {
    const liquidacion = await tx.liquidacion.create({
      data: {
        personalId: input.personalId,
        fechaInicio: new Date(input.fechaInicio),
        fechaFin: new Date(input.fechaFin),
        bruto: calculo.bruto,
        bonos: calculo.bonos,
        descuentoPrestamos,
        neto,
        liquidadoPorId,
      },
    });
    await tx.personal.update({ where: { id: input.personalId }, data: { noDisponibleDesde: diaSiguiente } });
    return liquidacion;
  });
}

export function listarLiquidaciones() {
  return prisma.liquidacion.findMany({
    include: { personal: { select: { nombreCompleto: true } } },
    orderBy: { fechaLiquidacion: "desc" },
  });
}

/** Deshace la no-disponibilidad si la persona regresa a trabajar — no borra el historial de la liquidación. */
export async function reactivarDisponibilidad(personalId: string) {
  return prisma.personal.update({ where: { id: personalId }, data: { noDisponibleDesde: null } });
}

/** Sobre en PDF aparte, mismo día de la liquidación (9.11) — mismo formato ya construido (9×15cm, 3 por hoja, total por día). */
export async function generarPdfLiquidacion(liquidacionId: string): Promise<PDFKit.PDFDocument> {
  const liquidacion = await prisma.liquidacion.findUniqueOrThrow({ where: { id: liquidacionId }, include: { personal: true } });
  const fechaInicio = liquidacion.fechaInicio.toISOString().slice(0, 10);
  const fechaFin = liquidacion.fechaFin.toISOString().slice(0, 10);
  const detalle = await detalleActividadesPersonaEnPeriodo(liquidacion.personalId, fechaInicio, fechaFin);

  const fila: FilaReporteSemanal = {
    personalId: liquidacion.personalId,
    nombreCompleto: liquidacion.personal.nombreCompleto,
    tipo: "destajo",
    bruto: Number(liquidacion.bruto),
    bonos: Number(liquidacion.bonos),
    descuentoPrestamos: Number(liquidacion.descuentoPrestamos),
    neto: Number(liquidacion.neto),
    prestamosAplicados: [],
  };

  return generarPdfSobres([fila], new Map([[liquidacion.personalId, detalle]]), { inicio: fechaInicio, fin: fechaFin });
}
