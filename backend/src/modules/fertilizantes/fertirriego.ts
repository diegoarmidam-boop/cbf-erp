import { calcularCantidadTotal, type ConcentracionUnidad } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import {
  confirmarEntregaComprometida,
  intentarComprometer,
  liberarComprometido,
  stockTotalProductoTx,
} from "../almacen/movimientos.js";
import { obtenerVersionVigente } from "../unidades-produccion/cuadros.js";
import { ProductoNoAutorizadoFertilizanteError, StockNoComprometidoError, TransicionFertilizacionInvalidaError } from "./granular.js";

const DIAS_VENCIMIENTO = 15;

export interface ProgramarFertirriegoInput {
  huertaId: string;
  seccionIds: string[];
  productoId: string;
  dosisValor: number;
  dosisUnidad: ConcentracionUnidad;
  litrosAguaPorHa: number;
  frecuencia: "diario" | "cada_2_dias" | "cada_3_dias" | "patron_2_1";
  fechaInicio: string;
  fechaFin: string;
}

/**
 * Programar — Camino 2 Fertirriego (9.5): se programa por Sección de Riego,
 * no por Cuadro. Misma fórmula que Aplicaciones (concentración × litros de
 * agua/ha × hectáreas). No hay "registrar como realizada" aquí — una vez
 * entregado a la Huerta, la ejecución diaria se registra desde Riego (9.6),
 * que todavía no se construye.
 */
export async function programarFertirriego(input: ProgramarFertirriegoInput, creadoPorId: string) {
  if (input.seccionIds.length === 0) {
    throw new Error("Elige al menos una Sección de Riego.");
  }
  const producto = await prisma.producto.findUniqueOrThrow({ where: { id: input.productoId } });
  if (producto.categoria !== "fertilizante" || !producto.autorizado) {
    throw new ProductoNoAutorizadoFertilizanteError();
  }

  let hectareasTotales = 0;
  const fechaRef = new Date(input.fechaInicio);
  for (const seccionId of input.seccionIds) {
    const cuadrosSeccion = await prisma.seccionRiegoCuadro.findMany({ where: { seccionId } });
    for (const { cuadroId } of cuadrosSeccion) {
      const version = await obtenerVersionVigente(cuadroId, fechaRef);
      if (version) hectareasTotales += Number(version.hectareas);
    }
  }
  if (hectareasTotales === 0) {
    throw new Error("Las Secciones de Riego elegidas no tienen Cuadros con una configuración vigente para la fecha de inicio.");
  }

  const cantidadTotalCalculada = calcularCantidadTotal(input.dosisValor, input.dosisUnidad, input.litrosAguaPorHa, hectareasTotales);

  return prisma.$transaction(async (tx) => {
    const fertirriego = await tx.fertirriegoProgramacion.create({
      data: {
        huertaId: input.huertaId,
        productoId: input.productoId,
        dosisValor: input.dosisValor,
        dosisUnidad: input.dosisUnidad,
        litrosAguaPorHa: input.litrosAguaPorHa,
        frecuencia: input.frecuencia,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        cantidadTotalCalculada,
        creadoPorId,
      },
    });
    await tx.fertirriegoSeccion.createMany({
      data: input.seccionIds.map((seccionId) => ({ fertirriegoId: fertirriego.id, seccionId })),
    });

    const comprometido = await intentarComprometer(tx, input.productoId, cantidadTotalCalculada, fertirriego.id, creadoPorId);
    if (!comprometido) {
      const disponible = await stockTotalProductoTx(tx, input.productoId);
      const faltante = cantidadTotalCalculada - disponible;
      await tx.ordenCompra.create({
        data: {
          origen: "automatica",
          productoId: input.productoId,
          cantidadSolicitada: faltante,
          estado: "pendiente_cotizar",
          referenciaAplicacionId: fertirriego.id,
          creadoPorId,
        },
      });
    }
    return fertirriego;
  });
}

async function enriquecerConAlertas<T extends { id: string; estado: string; fechaCreacion: Date }>(fertirriego: T) {
  const comprometido = await prisma.almacenCentralMovimiento.findFirst({ where: { referenciaId: fertirriego.id, tipo: "salida_comprometida" } });
  const diasSinEntregar = fertirriego.estado === "programada" ? Math.floor((Date.now() - fertirriego.fechaCreacion.getTime()) / 86_400_000) : null;

  return {
    ...fertirriego,
    comprometido: !!comprometido,
    diasSinEntregar,
    alertaVencimiento: (diasSinEntregar ?? 0) > DIAS_VENCIMIENTO,
  };
}

/**
 * La lista también trae `comprometido`/alertas, no solo el detalle — mismo
 * ajuste que Aplicaciones/Granular, encontrado probando la pantalla real.
 */
export async function listarFertirriego(huertaId?: string) {
  const fertirriegos = await prisma.fertirriegoProgramacion.findMany({
    where: { huertaId },
    include: { huerta: true, producto: true, secciones: { include: { seccion: true } } },
    orderBy: { fechaCreacion: "desc" },
  });
  return Promise.all(fertirriegos.map((f) => enriquecerConAlertas(f)));
}

export async function obtenerFertirriego(id: string) {
  const fertirriego = await prisma.fertirriegoProgramacion.findUniqueOrThrow({
    where: { id },
    include: { huerta: true, producto: true, secciones: { include: { seccion: true } } },
  });
  return enriquecerConAlertas(fertirriego);
}

/** Confirma la entrega física a la Huerta — acción de Almacén (Bodega). A partir de aquí, la ejecución diaria vive en Riego (9.6). */
export async function confirmarEntregaFertirriego(id: string, capturadoPorId: string) {
  const fertirriego = await prisma.fertirriegoProgramacion.findUniqueOrThrow({ where: { id } });
  if (fertirriego.estado !== "programada") throw new TransicionFertilizacionInvalidaError("programada");

  return prisma.$transaction(async (tx) => {
    const comprometido = await tx.almacenCentralMovimiento.findFirst({ where: { referenciaId: id, tipo: "salida_comprometida" } });
    if (!comprometido) throw new StockNoComprometidoError();

    await confirmarEntregaComprometida(
      tx,
      fertirriego.productoId,
      fertirriego.huertaId,
      Number(fertirriego.cantidadTotalCalculada),
      id,
      capturadoPorId
    );
    return tx.fertirriegoProgramacion.update({ where: { id }, data: { estado: "entregada" } });
  });
}

/** Cierra una programación que nunca se entregó (vencida a 15 días, o cancelación manual). */
export async function liberarFertirriegoVencido(id: string, capturadoPorId: string) {
  const fertirriego = await prisma.fertirriegoProgramacion.findUniqueOrThrow({ where: { id } });
  if (fertirriego.estado !== "programada") throw new TransicionFertilizacionInvalidaError("programada");

  return prisma.$transaction(async (tx) => {
    const comprometido = await tx.almacenCentralMovimiento.findFirst({ where: { referenciaId: id, tipo: "salida_comprometida" } });
    if (comprometido) {
      await liberarComprometido(
        tx,
        fertirriego.productoId,
        Number(fertirriego.cantidadTotalCalculada),
        id,
        capturadoPorId,
        "Liberación de fertirriego vencido (15 días sin entregar) o cancelado manualmente."
      );
    }
    return tx.fertirriegoProgramacion.update({ where: { id }, data: { estado: "vencida" } });
  });
}
