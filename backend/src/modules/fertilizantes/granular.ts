import { calcularCantidadTotalGranular, plantasTotalesCuadro, tarifaEfectiva, type ModoDosisGranular } from "@cbf/shared";
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

async function enriquecerConAlertas<T extends { id: string; estado: string; fechaCreacion: Date }>(fertilizacion: T) {
  const comprometido = await prisma.almacenCentralMovimiento.findFirst({
    where: { referenciaId: fertilizacion.id, tipo: "salida_comprometida" },
  });
  const entrega = await prisma.almacenCentralMovimiento.findFirst({ where: { referenciaId: fertilizacion.id, tipo: "salida_real" } });
  const diasSinEntregar = fertilizacion.estado === "programada" ? Math.floor((Date.now() - fertilizacion.fechaCreacion.getTime()) / 86_400_000) : null;
  const diasSinAplicar = fertilizacion.estado === "entregada" && entrega ? Math.floor((Date.now() - entrega.fecha.getTime()) / 86_400_000) : null;

  return {
    ...fertilizacion,
    comprometido: !!comprometido,
    diasSinEntregar,
    alertaVencimiento: (diasSinEntregar ?? 0) > DIAS_VENCIMIENTO,
    diasSinAplicar,
    alertaPendienteAplicar: (diasSinAplicar ?? 0) > DIAS_VENCIMIENTO,
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
    include: { huerta: true, producto: true, equipo: true, cuadros: { include: { cuadro: true } }, realizadas: true },
    orderBy: { fechaCreacion: "desc" },
  });
  return Promise.all(fertilizaciones.map((f) => enriquecerConAlertas(f)));
}

export async function obtenerGranular(id: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({
    where: { id },
    include: { huerta: true, producto: true, equipo: true, cuadros: { include: { cuadro: true } }, realizadas: true },
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

export interface RegistrarRealizadaGranularInput {
  personalId?: string;
  grupoId?: string;
  horas: number;
  fechaReal: string;
}

/** Paso 2, Registrar como realizada (Supervisor) — solo después de entregada. */
export async function registrarRealizadaGranular(id: string, input: RegistrarRealizadaGranularInput, registradoPorId: string) {
  if (!input.personalId && !input.grupoId) throw new Error("Falta quién hizo la fertilización (persona o grupo).");

  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id }, include: { cuadros: true } });
  if (fertilizacion.estado !== "entregada" && fertilizacion.estado !== "realizada") {
    throw new Error(
      "No se ha entregado el producto a esta Huerta todavía — Almacén debe confirmar la entrega antes de registrar la fertilización como realizada."
    );
  }

  const actividad = await prisma.actividad.findFirstOrThrow({ where: { nombre: NOMBRE_ACTIVIDAD_GRANULAR } });
  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
  const esPrimeraVezRealizada = fertilizacion.estado === "entregada";

  return prisma.$transaction(async (tx) => {
    const realizada = await tx.fertilizacionGranularRealizada.create({
      data: {
        fertilizacionId: id,
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
        huertaId: fertilizacion.huertaId,
        cuadroId: fertilizacion.cuadros.length === 1 ? fertilizacion.cuadros[0]!.cuadroId : undefined,
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
      const cantidad = Number(fertilizacion.cantidadTotalCalculada);
      const local = await tx.almacenLocal.upsert({
        where: { huertaId_productoId: { huertaId: fertilizacion.huertaId, productoId: fertilizacion.productoId } },
        update: { cantidadReportadaAcumulada: { increment: cantidad } },
        create: { huertaId: fertilizacion.huertaId, productoId: fertilizacion.productoId, cantidadReportadaAcumulada: cantidad },
      });
      await tx.almacenLocalMovimiento.create({
        data: { almacenLocalId: local.id, tipo: "consumo_reportado", cantidad, referenciaId: id, capturadoPorId: registradoPorId },
      });
    }

    return realizada;
  });
}

/** Cierra una fertilización programada que nunca se entregó (vencida a 15 días, o cancelación manual). */
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

/** Catálogo de fertilizantes ya autorizados — lo único elegible al programar (9.5). */
export function productosParaFertilizacion() {
  return prisma.producto.findMany({ where: { categoria: "fertilizante", autorizado: true }, orderBy: { nombreComercial: "asc" } });
}

/** Implementos elegibles cuando el recurso es "Con implemento" (9.5/9.13). */
export function equiposImplementoParaFertilizacion() {
  return listarEquipos("implemento");
}

/** Grupos de pago de una Huerta, para "quién la hizo" al registrar realizada. */
export function gruposParaFertilizacion(huertaId: string) {
  return prisma.grupoPago.findMany({ where: { huertaId }, orderBy: { nombre: "asc" } });
}
