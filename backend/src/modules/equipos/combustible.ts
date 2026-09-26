import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
import { entregarAHuerta } from "../almacen/movimientos.js";
import { obtenerUmbralDesviacionCombustible } from "../configuracion/empresa.js";

export class OdometroRetrocedeError extends Error {
  constructor(campo: "odometro" | "horometro", anterior: number, nuevo: number) {
    super(`El ${campo} nuevo (${nuevo}) no puede ser menor al último registrado (${anterior}) — nunca debe bajar.`);
  }
}

export class GarrafaInsuficienteError extends Error {
  constructor(disponible: number, solicitado: number) {
    super(`La garrafa de esta Huerta solo tiene ${disponible.toFixed(2)} L disponibles — se pidieron ${solicitado.toFixed(2)} L. Pide a Bodega que la surta primero.`);
  }
}

export class EquipoSinCombustibleError extends Error {
  constructor() {
    super("Este equipo funciona a batería — no lleva captura de combustible.");
  }
}

export type OrigenCombustibleCarga = "manual" | "automatico_aplicacion" | "automatico_actividad" | "automatico_fertirriego";

export interface CargaInput {
  fecha: string;
  tipo: "diesel_garrafa" | "gasolina_garrafa" | "gasolina_externa" | "diesel_externo";
  odometro?: number;
  horometro?: number;
  litros: number;
  precioUnitario?: number;
  productoId?: string; // requerido si tipo=diesel_garrafa/gasolina_garrafa — de qué producto de Almacén sale
  huertaId?: string; // requerido si tipo=diesel_garrafa/gasolina_garrafa — Huerta cuya garrafa se descuenta
  fotoUrl?: string; // requerida si tipo=diesel_garrafa/gasolina_garrafa
  referenciaLineaId?: string;
  origen?: OrigenCombustibleCarga;
}

async function validarNoRetrocede(tx: TransactionClient, equipoId: string, campo: "odometro" | "horometro", nuevo: number | undefined): Promise<void> {
  if (nuevo == null) return;
  const ultima = await tx.combustibleCarga.findFirst({
    where: { equipoId, [campo]: { not: null } },
    orderBy: { fecha: "desc" },
  });
  const anterior = ultima ? Number(ultima[campo]) : null;
  if (anterior != null && nuevo < anterior) throw new OdometroRetrocedeError(campo, anterior, nuevo);
}

/**
 * Descuenta el relleno de una garrafa del Almacén Local de una Huerta (V1
 * P3, 26-sep-2026, 9.13a) — mismo criterio de "consumo_reportado" que
 * Aplicaciones/Granular usan para cualquier otro producto: el combustible YA
 * entró a esa Huerta vía `entregarAHuerta` (Bodega, "Entregar a Huerta"), y
 * cada relleno de tractor/motobomba descuenta de ahí, nunca de Almacén
 * Central directo.
 */
async function descontarGarrafaLocal(
  tx: TransactionClient,
  huertaId: string,
  productoId: string,
  litros: number,
  referenciaId: string,
  capturadoPorId: string
): Promise<void> {
  const local = await tx.almacenLocal.findUnique({ where: { huertaId_productoId: { huertaId, productoId } } });
  const disponible = local ? Number(local.cantidadRecibidaAcumulada) - Number(local.cantidadReportadaAcumulada) : 0;
  if (disponible + 0.0001 < litros) throw new GarrafaInsuficienteError(disponible, litros);

  const actualizado = await tx.almacenLocal.update({
    where: { huertaId_productoId: { huertaId, productoId } },
    data: { cantidadReportadaAcumulada: { increment: litros } },
  });
  await tx.almacenLocalMovimiento.create({
    data: { almacenLocalId: actualizado.id, tipo: "consumo_reportado", cantidad: litros, referenciaId, capturadoPorId },
  });
}

/** Bodega surte la garrafa de una Huerta desde Almacén Central — es exactamente "Entregar a Huerta" de cualquier producto, reutilizado tal cual. */
export function surtirGarrafa(productoId: string, huertaId: string, litros: number, capturadoPorId: string) {
  return entregarAHuerta(productoId, huertaId, litros, capturadoPorId);
}

/** Núcleo de registrarCarga, dentro de una transacción ya abierta — para que Aplicaciones/Actividades puedan crear la carga del tractor de una línea junto con el resto del reporte, todo o nada. */
export async function registrarCargaTx(tx: TransactionClient, equipoId: string, input: CargaInput, capturadoPorId: string) {
  const equipo = await tx.equipo.findUniqueOrThrow({ where: { id: equipoId } });
  if (equipo.tipo === "drone") throw new EquipoSinCombustibleError();

  await validarNoRetrocede(tx, equipoId, "odometro", input.odometro);
  await validarNoRetrocede(tx, equipoId, "horometro", input.horometro);

  const esGarrafa = input.tipo === "diesel_garrafa" || input.tipo === "gasolina_garrafa";
  if (esGarrafa) {
    if (!input.productoId) throw new Error("Falta el producto de Almacén del que sale el combustible de garrafa.");
    if (!input.huertaId) throw new Error("Falta la Huerta cuya garrafa se está descontando.");
    if (!input.fotoUrl) throw new Error("Falta la foto del relleno.");
  }

  const carga = await tx.combustibleCarga.create({
    data: {
      equipoId,
      fecha: new Date(input.fecha),
      tipo: input.tipo,
      odometro: input.odometro,
      horometro: input.horometro,
      litros: input.litros,
      precioUnitario: input.precioUnitario,
      huertaId: esGarrafa ? input.huertaId : undefined,
      productoId: esGarrafa ? input.productoId : undefined,
      fotoUrl: input.fotoUrl,
      origen: input.origen ?? "manual",
      referenciaLineaId: input.referenciaLineaId,
      capturadoPorId,
    },
  });
  if (esGarrafa && input.productoId && input.huertaId) {
    await descontarGarrafaLocal(tx, input.huertaId, input.productoId, input.litros, carga.id, capturadoPorId);
  }
  return carga;
}

export async function registrarCarga(equipoId: string, input: CargaInput, capturadoPorId: string) {
  return prisma.$transaction((tx) => registrarCargaTx(tx, equipoId, input, capturadoPorId));
}

/**
 * Revierte el descuento de Almacén Local de una carga de garrafa (V1 P3,
 * 26-sep-2026) — para cuando el reporte de avance que la generó se edita o
 * se borra. Borra también la carga misma (su bitácora vive en el historial
 * de Combustible del equipo solo mientras el reporte exista).
 */
export async function revertirCargaGarrafaTx(tx: TransactionClient, cargaId: string, capturadoPorId: string): Promise<void> {
  const carga = await tx.combustibleCarga.findUniqueOrThrow({ where: { id: cargaId } });
  if (carga.huertaId && carga.productoId) {
    const local = await tx.almacenLocal.update({
      where: { huertaId_productoId: { huertaId: carga.huertaId, productoId: carga.productoId } },
      data: { cantidadReportadaAcumulada: { decrement: carga.litros } },
    });
    await tx.almacenLocalMovimiento.create({
      data: { almacenLocalId: local.id, tipo: "ajuste_manual", cantidad: -Number(carga.litros), referenciaId: cargaId, capturadoPorId },
    });
  }
  await tx.combustibleCarga.delete({ where: { id: cargaId } });
}

export function historialCargas(equipoId: string) {
  return prisma.combustibleCarga.findMany({ where: { equipoId }, orderBy: { fecha: "desc" } });
}

export interface AlertaRendimiento {
  tasaActual: number;
  promedioHistorico: number;
  unidad: "L/hora" | "km/L" | "L/ha";
  desviacionPorcentual: number;
  anomalo: boolean;
}

/**
 * Alerta de consumo anómalo (9.13): tractores/motobomba por litros/hora* (ver
 * nota), camionetas por km/litro — siempre contra el histórico PROPIO de ese
 * equipo, nunca comparado entre equipos distintos. El umbral es editable en
 * Configuración (V1 P3, 26-sep-2026) — antes una constante fija en código.
 */
export async function calcularAlertaRendimiento(equipoId: string): Promise<AlertaRendimiento | null> {
  const equipo = await prisma.equipo.findUniqueOrThrow({ where: { id: equipoId } });
  const esTractor = equipo.tipo === "tractor";
  // "fecha" es solo la fecha (sin hora) — varias cargas el mismo día son
  // comunes, así que se necesita un desempate. odómetro/horómetro son
  // monotónicos crecientes por la validación dura de registrarCarga, así
  // que ordenar por ese campo reconstruye el orden cronológico real.
  const cargas = await prisma.combustibleCarga.findMany({
    where: { equipoId },
    orderBy: esTractor ? [{ fecha: "asc" }, { horometro: "asc" }] : [{ fecha: "asc" }, { odometro: "asc" }],
  });
  if (cargas.length < 2) return null;
  const tasas: number[] = [];
  for (let i = 1; i < cargas.length; i++) {
    const anterior = cargas[i - 1]!;
    const actual = cargas[i]!;
    if (esTractor && actual.horometro != null && anterior.horometro != null) {
      const horas = Number(actual.horometro) - Number(anterior.horometro);
      if (horas > 0) tasas.push(Number(actual.litros) / horas);
    } else if (!esTractor && actual.odometro != null && anterior.odometro != null) {
      const km = Number(actual.odometro) - Number(anterior.odometro);
      if (km > 0 && Number(actual.litros) > 0) tasas.push(km / Number(actual.litros));
    }
  }
  if (tasas.length < 2) return null;

  const tasaActual = tasas[tasas.length - 1]!;
  const historicas = tasas.slice(0, -1);
  const promedioHistorico = historicas.reduce((s, t) => s + t, 0) / historicas.length;
  const desviacionPorcentual = promedioHistorico > 0 ? (tasaActual - promedioHistorico) / promedioHistorico : 0;
  const umbral = await obtenerUmbralDesviacionCombustible();

  return {
    tasaActual,
    promedioHistorico,
    unidad: esTractor ? "L/hora" : "km/L",
    desviacionPorcentual,
    anomalo: Math.abs(desviacionPorcentual) > umbral,
  };
}

/** Hectáreas del reporte de avance (Aplicación/Actividad) al que una carga automática de tractor quedó ligada. */
async function hectareasDelReporteLigado(carga: { origen: OrigenCombustibleCarga; referenciaLineaId: string | null }): Promise<number | null> {
  if (!carga.referenciaLineaId) return null;
  if (carga.origen === "automatico_aplicacion") {
    const linea = await prisma.aplicacionRealizadaLinea.findUnique({ where: { id: carga.referenciaLineaId }, include: { realizada: true } });
    return linea ? Number(linea.realizada.hectareas) : null;
  }
  if (carga.origen === "automatico_actividad") {
    const linea = await prisma.actividadRealizadaLinea.findUnique({ where: { id: carga.referenciaLineaId }, include: { realizada: true } });
    return linea ? Number(linea.realizada.hectareas) : null;
  }
  return null;
}

/**
 * L/ha de tractor (por avance) y L/ha fertirrigada de motobomba (V1 P3,
 * 26-sep-2026, 9.13f) — mismo criterio que calcularAlertaRendimiento: contra
 * el histórico PROPIO del equipo. Null para equipos donde no aplica (Drone
 * no lleva combustible; camioneta usa km/L, no L/ha).
 */
export async function calcularAlertaLitrosPorHectarea(equipoId: string): Promise<AlertaRendimiento | null> {
  const equipo = await prisma.equipo.findUniqueOrThrow({ where: { id: equipoId } });
  if (equipo.tipo !== "tractor" && equipo.tipo !== "motobomba") return null;

  const cargas = await prisma.combustibleCarga.findMany({
    where: equipo.tipo === "motobomba" ? { equipoId } : { equipoId, referenciaLineaId: { not: null } },
    orderBy: { fecha: "asc" },
  });

  const tasas: number[] = [];
  for (const carga of cargas) {
    let hectareas: number | null;
    if (equipo.tipo === "motobomba") {
      const secciones = await prisma.combustibleCargaSeccion.findMany({ where: { cargaId: carga.id } });
      const total = secciones.reduce((s, x) => s + Number(x.hectareasAtribuidas), 0);
      hectareas = total > 0 ? total : null;
    } else {
      hectareas = await hectareasDelReporteLigado({ origen: carga.origen as OrigenCombustibleCarga, referenciaLineaId: carga.referenciaLineaId });
    }
    if (hectareas && hectareas > 0) tasas.push(Number(carga.litros) / hectareas);
  }
  if (tasas.length < 2) return null;

  const tasaActual = tasas[tasas.length - 1]!;
  const historicas = tasas.slice(0, -1);
  const promedioHistorico = historicas.reduce((s, t) => s + t, 0) / historicas.length;
  const desviacionPorcentual = promedioHistorico > 0 ? (tasaActual - promedioHistorico) / promedioHistorico : 0;
  const umbral = await obtenerUmbralDesviacionCombustible();

  return {
    tasaActual,
    promedioHistorico,
    unidad: "L/ha",
    desviacionPorcentual,
    anomalo: Math.abs(desviacionPorcentual) > umbral,
  };
}
