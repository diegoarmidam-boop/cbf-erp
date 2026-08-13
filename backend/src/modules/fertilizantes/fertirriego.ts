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

export interface ProductoFertirriegoInput {
  productoId: string;
  dosisValor: number;
  dosisUnidad: ConcentracionUnidad;
}

export interface ProgramarFertirriegoInput {
  huertaId: string;
  seccionIds: string[];
  productos: ProductoFertirriegoInput[];
  litrosAguaPorHa: number;
  frecuencia: "diario" | "cada_2_dias" | "cada_3_dias" | "patron_2_1";
  fechaInicio: string;
  fechaFin: string;
}

/**
 * Programar — Camino 2 Fertirriego (9.5): se programa por Sección de Riego,
 * no por Cuadro. Misma fórmula que Aplicaciones (concentración × litros de
 * agua/ha × hectáreas). Varios productos (10-ago-2026): mismo mecanismo que
 * Aplicaciones — cada producto con su propia concentración, todos
 * comparten los mismos litros de agua/ha. No hay "registrar como
 * realizada" aquí — una vez entregado a la Huerta, la ejecución diaria se
 * registra desde Riego (9.6).
 */
export async function programarFertirriego(input: ProgramarFertirriegoInput, creadoPorId: string) {
  if (input.seccionIds.length === 0) {
    throw new Error("Elige al menos una Sección de Riego.");
  }
  if (!input.productos || input.productos.length === 0) {
    throw new Error("Elige al menos un producto.");
  }
  const productos = await prisma.producto.findMany({ where: { id: { in: input.productos.map((p) => p.productoId) } } });
  for (const p of productos) {
    if (p.categoria !== "fertilizante" || !p.autorizado) {
      throw new ProductoNoAutorizadoFertilizanteError();
    }
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

  return prisma.$transaction(async (tx) => {
    const fertirriego = await tx.fertirriegoProgramacion.create({
      data: {
        huertaId: input.huertaId,
        litrosAguaPorHa: input.litrosAguaPorHa,
        frecuencia: input.frecuencia,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        creadoPorId,
      },
    });
    await tx.fertirriegoSeccion.createMany({
      data: input.seccionIds.map((seccionId) => ({ fertirriegoId: fertirriego.id, seccionId })),
    });

    for (const p of input.productos) {
      const cantidadTotalCalculada = calcularCantidadTotal(p.dosisValor, p.dosisUnidad, input.litrosAguaPorHa, hectareasTotales);
      await tx.fertirriegoProgramacionProducto.create({
        data: {
          fertirriegoId: fertirriego.id,
          productoId: p.productoId,
          dosisValor: p.dosisValor,
          dosisUnidad: p.dosisUnidad,
          cantidadTotalCalculada,
        },
      });

      const comprometido = await intentarComprometer(tx, p.productoId, cantidadTotalCalculada, fertirriego.id, creadoPorId);
      if (!comprometido) {
        const disponible = await stockTotalProductoTx(tx, p.productoId);
        const faltante = cantidadTotalCalculada - disponible;
        await tx.ordenCompra.create({
          data: {
            origen: "automatica",
            productoId: p.productoId,
            cantidadSolicitada: faltante,
            estado: "pendiente_cotizar",
            referenciaAplicacionId: fertirriego.id,
            creadoPorId,
          },
        });
      }
    }
    return fertirriego;
  });
}

const INCLUDE_FERTIRRIEGO = { huerta: true, productos: { include: { producto: true } }, secciones: { include: { seccion: true } } };

async function enriquecerConAlertas<T extends { id: string; estado: string; fechaCreacion: Date; productos: { productoId: string }[] }>(
  fertirriego: T
) {
  const comprometidos = await prisma.almacenCentralMovimiento.findMany({ where: { referenciaId: fertirriego.id, tipo: "salida_comprometida" } });
  const comprometido = fertirriego.productos.every((p) => comprometidos.some((m) => m.productoId === p.productoId));
  const diasSinEntregar = fertirriego.estado === "programada" ? Math.floor((Date.now() - fertirriego.fechaCreacion.getTime()) / 86_400_000) : null;

  return {
    ...fertirriego,
    comprometido,
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
    include: INCLUDE_FERTIRRIEGO,
    orderBy: { fechaCreacion: "desc" },
  });
  return Promise.all(fertirriegos.map((f) => enriquecerConAlertas(f)));
}

export async function obtenerFertirriego(id: string) {
  const fertirriego = await prisma.fertirriegoProgramacion.findUniqueOrThrow({
    where: { id },
    include: INCLUDE_FERTIRRIEGO,
  });
  return enriquecerConAlertas(fertirriego);
}

/** Confirma la entrega física a la Huerta de TODOS los productos — acción de Almacén (Bodega). A partir de aquí, la ejecución diaria vive en Riego (9.6). */
export async function confirmarEntregaFertirriego(id: string, capturadoPorId: string) {
  const fertirriego = await prisma.fertirriegoProgramacion.findUniqueOrThrow({ where: { id }, include: { productos: true } });
  if (fertirriego.estado !== "programada") throw new TransicionFertilizacionInvalidaError("programada");

  return prisma.$transaction(async (tx) => {
    const comprometidos = await tx.almacenCentralMovimiento.findMany({ where: { referenciaId: id, tipo: "salida_comprometida" } });
    const faltaAlguno = fertirriego.productos.some((p) => !comprometidos.some((m) => m.productoId === p.productoId));
    if (faltaAlguno) throw new StockNoComprometidoError();

    for (const p of fertirriego.productos) {
      await confirmarEntregaComprometida(tx, p.productoId, fertirriego.huertaId, Number(p.cantidadTotalCalculada), id, capturadoPorId);
    }
    return tx.fertirriegoProgramacion.update({ where: { id }, data: { estado: "entregada" } });
  });
}

/** Cierra una programación que nunca se entregó (vencida a 15 días, o cancelación manual). Libera el stock comprometido de cada producto que sí llegó a apartarse. */
export async function liberarFertirriegoVencido(id: string, capturadoPorId: string) {
  const fertirriego = await prisma.fertirriegoProgramacion.findUniqueOrThrow({ where: { id }, include: { productos: true } });
  if (fertirriego.estado !== "programada") throw new TransicionFertilizacionInvalidaError("programada");

  return prisma.$transaction(async (tx) => {
    for (const p of fertirriego.productos) {
      const comprometido = await tx.almacenCentralMovimiento.findFirst({
        where: { referenciaId: id, tipo: "salida_comprometida", productoId: p.productoId },
      });
      if (comprometido) {
        await liberarComprometido(
          tx,
          p.productoId,
          Number(p.cantidadTotalCalculada),
          id,
          capturadoPorId,
          "Liberación de fertirriego vencido (15 días sin entregar) o cancelado manualmente."
        );
      }
    }
    return tx.fertirriegoProgramacion.update({ where: { id }, data: { estado: "vencida" } });
  });
}
