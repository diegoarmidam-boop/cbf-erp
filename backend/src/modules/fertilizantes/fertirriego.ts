import { calcularCantidadTotal, calcularMezclaPorTanque, type ConcentracionUnidad } from "@cbf/shared";
import type { Rol } from "@prisma/client";
import { prisma } from "../../core/db.js";
import {
  confirmarEntregaComprometida,
  intentarComprometer,
  liberarComprometido,
  stockTotalProductoTx,
} from "../almacen/movimientos.js";
import { obtenerVersionVigente } from "../unidades-produccion/cuadros.js";
import { ProductoNoAutorizadoFertilizanteError, StockNoComprometidoError, TransicionFertilizacionInvalidaError } from "./granular.js";
import { actualizarDosisProductoEnReceta, obtenerReceta, ROLES_RECETAS } from "../recetario/recetario.js";

const DIAS_VENCIMIENTO = 15;

/** Hectáreas totales de un conjunto de Secciones de Riego, a partir de sus Cuadros — no se persiste, se recalcula cada vez (mismo criterio de programarFertirriego). */
async function hectareasDeSecciones(seccionIds: string[], fecha: Date): Promise<number> {
  let hectareasTotales = 0;
  for (const seccionId of seccionIds) {
    const cuadrosSeccion = await prisma.seccionRiegoCuadro.findMany({ where: { seccionId } });
    for (const { cuadroId } of cuadrosSeccion) {
      const version = await obtenerVersionVigente(cuadroId, fecha);
      if (version) hectareasTotales += Number(version.hectareas);
    }
  }
  return hectareasTotales;
}

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
  // Recetario (20-ago-2026): mismo mecanismo que Aplicaciones — ver el
  // comentario completo en aplicaciones.ts.
  recetaId?: string;
  capacidadTanque?: number;
  actualizarRecetaOriginal?: boolean;
}

export class RolNoPuedeAjustarRecetaFertirriegoError extends Error {
  constructor() {
    super("Tu rol solo puede usar esta receta tal cual está guardada — no puede cambiar la dosis. Pide a Dirección General o al Gerente Técnico de Producción que la ajuste.");
  }
}

async function validarUsoDeRecetaFertirriego(
  recetaId: string,
  usuarioRol: Rol,
  litrosAguaPorHa: number,
  productos: ProductoFertirriegoInput[]
) {
  const receta = await obtenerReceta(recetaId);
  if (!ROLES_RECETAS.includes(usuarioRol)) {
    const mismaAgua = Number(receta.litrosPorHa) === litrosAguaPorHa;
    const mismasDosis = receta.productos.every((rp) => {
      const enviado = productos.find((p) => p.productoId === rp.productoId);
      return enviado && Number(rp.concentracionValor) === enviado.dosisValor && rp.concentracionUnidad === enviado.dosisUnidad;
    });
    if (!mismaAgua || !mismasDosis || receta.productos.length !== productos.length) {
      throw new RolNoPuedeAjustarRecetaFertirriegoError();
    }
  }
  return receta;
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
export async function programarFertirriego(input: ProgramarFertirriegoInput, creadoPorId: string, usuarioRol: Rol) {
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

  if (input.recetaId) {
    await validarUsoDeRecetaFertirriego(input.recetaId, usuarioRol, input.litrosAguaPorHa, input.productos);
    if (input.actualizarRecetaOriginal) {
      for (const p of input.productos) {
        await actualizarDosisProductoEnReceta(input.recetaId, p.productoId, p.dosisValor, p.dosisUnidad);
      }
    }
  }

  const fechaRef = new Date(input.fechaInicio);
  const hectareasTotales = await hectareasDeSecciones(input.seccionIds, fechaRef);
  if (hectareasTotales === 0) {
    throw new Error("Las Secciones de Riego elegidas no tienen Cuadros con una configuración vigente para la fecha de inicio.");
  }

  return prisma.$transaction(async (tx) => {
    const fertirriego = await tx.fertirriegoProgramacion.create({
      data: {
        huertaId: input.huertaId,
        litrosAguaPorHa: input.litrosAguaPorHa,
        recetaId: input.recetaId,
        capacidadTanque: input.capacidadTanque,
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

type FertirriegoConTanque = {
  id: string;
  estado: string;
  fechaCreacion: Date;
  fechaInicio: Date;
  litrosAguaPorHa: unknown;
  capacidadTanque: unknown;
  secciones: { seccionId: string }[];
  productos: { productoId: string; dosisValor: unknown; dosisUnidad: ConcentracionUnidad }[];
};

/**
 * Mezcla por tanque (bloque nuevo, 20-ago-2026): mismo criterio que
 * Aplicaciones — calculado al vuelo, nunca persistido. Las hectáreas
 * totales de Fertirriego no se guardan (se derivan de las Secciones cada
 * vez, ver hectareasDeSecciones), así que este cálculo sí necesita una
 * consulta extra — solo se hace cuando capacidadTanque no es nulo.
 */
async function calcularMezclaPorTanqueDeFertirriego(fertirriego: FertirriegoConTanque) {
  if (fertirriego.capacidadTanque == null) return null;
  const hectareasTotales = await hectareasDeSecciones(fertirriego.secciones.map((s) => s.seccionId), fertirriego.fechaInicio);
  const litrosAguaPorHa = Number(fertirriego.litrosAguaPorHa);
  const capacidadTanque = Number(fertirriego.capacidadTanque);
  return fertirriego.productos.map((p) => ({
    productoId: p.productoId,
    ...calcularMezclaPorTanque(Number(p.dosisValor), p.dosisUnidad, litrosAguaPorHa, capacidadTanque, hectareasTotales),
  }));
}

async function enriquecerConAlertas<T extends FertirriegoConTanque>(fertirriego: T) {
  const comprometidos = await prisma.almacenCentralMovimiento.findMany({ where: { referenciaId: fertirriego.id, tipo: "salida_comprometida" } });
  const comprometido = fertirriego.productos.every((p) => comprometidos.some((m) => m.productoId === p.productoId));
  const diasSinEntregar = fertirriego.estado === "programada" ? Math.floor((Date.now() - fertirriego.fechaCreacion.getTime()) / 86_400_000) : null;

  return {
    ...fertirriego,
    comprometido,
    diasSinEntregar,
    alertaVencimiento: (diasSinEntregar ?? 0) > DIAS_VENCIMIENTO,
    mezclaPorTanque: await calcularMezclaPorTanqueDeFertirriego(fertirriego),
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
