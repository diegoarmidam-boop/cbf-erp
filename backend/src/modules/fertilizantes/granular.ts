import { calcularCantidadTotalGranular, ordenarPorNombreNumerico, plantasTotalesCuadro, tarifaEfectiva, type ModoDosisGranular } from "@cbf/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
import {
  ajustarCantidadProducto,
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
import { cancelarOrdenesDeReferencia } from "../compras/ordenes.js";

// Actividad de Nómina para la mano de obra automática de Fertilización
// Granular (9.5/9.11) — decisión explícita del usuario: ninguna de las 12
// actividades confirmadas originalmente representaba esto, se agregó
// "Fertilización" al catálogo con el mismo esquema que las demás.
const NOMBRE_ACTIVIDAD_GRANULAR = "Fertilización";
const DIAS_VENCIMIENTO = 15;

export class ProductoNoAutorizadoFertilizanteError extends Error {
  constructor() {
    super("Uno de los productos elegidos no es un fertilizante autorizado — no se puede programar una fertilización con él.");
  }
}

export class TransicionFertilizacionInvalidaError extends Error {
  constructor(esperado: string) {
    super(`Esta fertilización no está en estado "${esperado}".`);
  }
}

export class StockNoComprometidoError extends Error {
  constructor() {
    super("Todavía no hay suficiente stock apartado para todos los productos de esta fertilización — espera a que llegue la compra automática.");
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

export interface ProductoGranularInput {
  productoId: string;
  modoDosis: ModoDosisGranular;
  dosisValor: number;
}

export interface ProgramarGranularInput {
  huertaId: string;
  cuadroIds: string[];
  productos: ProductoGranularInput[];
  recursoTipo: "gente" | "implemento";
  equipoId?: string;
  fechaInicio: string;
  fechaFin: string;
}

/**
 * Paso 1, Programar — Camino 1 Granular (9.5, mismo patrón que Aplicaciones
 * 9.7): kg/ha usa hectáreas totales; g/planta usa el total de plantas del
 * Marco de Plantación de cada Cuadro. Varios productos en polvo (10-ago-
 * 2026): cada uno conserva su propia dosis (kg/ha o g/planta) de forma
 * completamente independiente — a diferencia de Aplicaciones, no hay
 * "litros de mezcla" compartido. Cada producto aparta stock de inmediato si
 * alcanza; si no, genera automático una orden de Compras por el faltante.
 */
export async function programarGranular(input: ProgramarGranularInput, creadoPorId: string) {
  if (input.recursoTipo === "implemento" && !input.equipoId) {
    throw new Error("Falta el equipo — el recurso 'Con implemento' requiere elegir un equipo.");
  }
  if (input.cuadroIds.length === 0) {
    throw new Error("Elige al menos un Cuadro.");
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
  let plantasTotales = 0;
  const requierePlantas = input.productos.some((p) => p.modoDosis === "g_planta");
  const fechaRef = new Date(input.fechaInicio);
  for (const cuadroId of input.cuadroIds) {
    const version = await obtenerVersionVigente(cuadroId, fechaRef);
    if (!version) throw new Error("El Cuadro elegido no tiene una configuración vigente para la fecha de inicio.");
    hectareasTotales += Number(version.hectareas);
    if (requierePlantas) {
      if (!version.distSurcosM || !version.distPlantasM) {
        throw new Error("El Cuadro elegido no tiene Marco de Plantación configurado — no se puede calcular g/planta.");
      }
      plantasTotales += plantasTotalesCuadro(Number(version.hectareas), Number(version.distSurcosM), Number(version.distPlantasM));
    }
  }

  return prisma.$transaction(async (tx) => {
    const fertilizacion = await tx.fertilizacionGranular.create({
      data: {
        huertaId: input.huertaId,
        recursoTipo: input.recursoTipo,
        equipoId: input.recursoTipo === "implemento" ? input.equipoId : undefined,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        hectareasTotalesProgramadas: hectareasTotales,
        creadoPorId,
      },
    });
    await tx.fertilizacionGranularCuadro.createMany({
      data: input.cuadroIds.map((cuadroId) => ({ fertilizacionId: fertilizacion.id, cuadroId })),
    });

    for (const p of input.productos) {
      const cantidadTotalCalculada = calcularCantidadTotalGranular(p.modoDosis, p.dosisValor, hectareasTotales, plantasTotales);
      await tx.fertilizacionGranularProducto.create({
        data: {
          fertilizacionId: fertilizacion.id,
          productoId: p.productoId,
          modoDosis: p.modoDosis,
          dosisValor: p.dosisValor,
          cantidadTotalCalculada,
        },
      });

      const comprometido = await intentarComprometer(tx, p.productoId, cantidadTotalCalculada, fertilizacion.id, creadoPorId);
      if (!comprometido) {
        const disponible = await stockTotalProductoTx(tx, p.productoId);
        const faltante = cantidadTotalCalculada - disponible;
        await tx.ordenCompra.create({
          data: {
            origen: "automatica",
            productoId: p.productoId,
            cantidadSolicitada: faltante,
            estado: "pendiente_cotizar",
            referenciaAplicacionId: fertilizacion.id,
            creadoPorId,
          },
        });
      }
    }
    return fertilizacion;
  });
}

export class YaHayAvanceReportadoGranularError extends Error {
  constructor() {
    super("Esta Fertilización ya tiene reportes de avance — no se puede editar la dosis, cancélala y reprograma con los datos correctos.");
  }
}

/**
 * Editar el Paso 1 ya programado/entregado (9.5, 15-ago-2026, reabre
 * decisión previa) — mismo criterio que Aplicaciones (9.7): permitido
 * mientras no exista ningún reporte de avance todavía. Cada producto
 * conserva su propia dosis independiente (sin litros de mezcla
 * compartidos), así que el ajuste se calcula producto por producto igual
 * que en la programación original.
 */
export async function editarGranularProgramada(id: string, input: Omit<ProgramarGranularInput, "huertaId">, editadoPorId: string) {
  if (input.recursoTipo === "implemento" && !input.equipoId) {
    throw new Error("Falta el equipo — el recurso 'Con implemento' requiere elegir un equipo.");
  }
  if (input.cuadroIds.length === 0) throw new Error("Elige al menos un Cuadro.");
  if (!input.productos || input.productos.length === 0) throw new Error("Elige al menos un producto.");

  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({
    where: { id },
    include: { productos: true, realizadas: true },
  });
  if (fertilizacion.estado !== "programada" && fertilizacion.estado !== "entregada") {
    throw new TransicionFertilizacionInvalidaError("programada o entregada");
  }
  if (fertilizacion.realizadas.length > 0) throw new YaHayAvanceReportadoGranularError();

  const productosNuevos = await prisma.producto.findMany({ where: { id: { in: input.productos.map((p) => p.productoId) } } });
  for (const p of productosNuevos) {
    if (p.categoria !== "fertilizante" || !p.autorizado) throw new ProductoNoAutorizadoFertilizanteError();
  }

  let hectareasTotales = 0;
  let plantasTotales = 0;
  const requierePlantas = input.productos.some((p) => p.modoDosis === "g_planta");
  const fechaRef = new Date(input.fechaInicio);
  for (const cuadroId of input.cuadroIds) {
    const version = await obtenerVersionVigente(cuadroId, fechaRef);
    if (!version) throw new Error("El Cuadro elegido no tiene una configuración vigente para la fecha de inicio.");
    hectareasTotales += Number(version.hectareas);
    if (requierePlantas) {
      if (!version.distSurcosM || !version.distPlantasM) {
        throw new Error("El Cuadro elegido no tiene Marco de Plantación configurado — no se puede calcular g/planta.");
      }
      plantasTotales += plantasTotalesCuadro(Number(version.hectareas), Number(version.distSurcosM), Number(version.distPlantasM));
    }
  }

  const entregada = fertilizacion.estado === "entregada";

  return prisma.$transaction(async (tx) => {
    const productosAnteriores = new Map(fertilizacion.productos.map((p) => [p.productoId, p]));
    const productoIdsNuevos = new Set(input.productos.map((p) => p.productoId));

    for (const anterior of fertilizacion.productos) {
      if (productoIdsNuevos.has(anterior.productoId)) continue;
      await ajustarCantidadProducto(tx, fertilizacion.huertaId, id, anterior.productoId, Number(anterior.cantidadTotalCalculada), 0, entregada, editadoPorId);
      await tx.fertilizacionGranularProducto.delete({ where: { id: anterior.id } });
    }

    for (const p of input.productos) {
      const cantidadNueva = calcularCantidadTotalGranular(p.modoDosis, p.dosisValor, hectareasTotales, plantasTotales);
      const anterior = productosAnteriores.get(p.productoId);
      const cantidadAnterior = anterior ? Number(anterior.cantidadTotalCalculada) : 0;

      await ajustarCantidadProducto(tx, fertilizacion.huertaId, id, p.productoId, cantidadAnterior, cantidadNueva, entregada, editadoPorId);

      if (anterior) {
        await tx.fertilizacionGranularProducto.update({
          where: { id: anterior.id },
          data: { modoDosis: p.modoDosis, dosisValor: p.dosisValor, cantidadTotalCalculada: cantidadNueva },
        });
      } else {
        await tx.fertilizacionGranularProducto.create({
          data: { fertilizacionId: id, productoId: p.productoId, modoDosis: p.modoDosis, dosisValor: p.dosisValor, cantidadTotalCalculada: cantidadNueva },
        });
      }
    }

    await tx.fertilizacionGranularCuadro.deleteMany({ where: { fertilizacionId: id } });
    await tx.fertilizacionGranularCuadro.createMany({ data: input.cuadroIds.map((cuadroId) => ({ fertilizacionId: id, cuadroId })) });

    return tx.fertilizacionGranular.update({
      where: { id },
      data: {
        recursoTipo: input.recursoTipo,
        equipoId: input.recursoTipo === "implemento" ? input.equipoId : null,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        hectareasTotalesProgramadas: hectareasTotales,
      },
    });
  });
}

const INCLUDE_GRANULAR = {
  huerta: true,
  productos: { include: { producto: true } },
  equipo: true,
  cuadros: { include: { cuadro: true } },
  realizadas: { include: { cuadros: { include: { cuadro: true } } }, orderBy: { fechaReal: "desc" as const } },
};

type GranularConRealizadas = {
  id: string;
  estado: string;
  fechaCreacion: Date;
  hectareasTotalesProgramadas: Prisma.Decimal;
  productos: { productoId: string; cantidadTotalCalculada: Prisma.Decimal }[];
  realizadas: { cuadros: { hectareas: Prisma.Decimal }[]; horas: Prisma.Decimal }[];
};

async function enriquecerConAlertas<T extends GranularConRealizadas>(fertilizacion: T) {
  // Comprometido/entregado a nivel fertilización = TODOS sus productos lo
  // están (10-ago-2026, varios productos) — mismo criterio que Aplicaciones.
  const movimientosComprometido = await prisma.almacenCentralMovimiento.findMany({
    where: { referenciaId: fertilizacion.id, tipo: "salida_comprometida" },
  });
  const movimientosEntrega = await prisma.almacenCentralMovimiento.findMany({
    where: { referenciaId: fertilizacion.id, tipo: "salida_real" },
  });
  const comprometido = fertilizacion.productos.every((p) => movimientosComprometido.some((m) => m.productoId === p.productoId));
  const entrega = movimientosEntrega[0];

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
    comprometido,
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
/** 9.15 (31-ago-2026): Cuadros en orden numérico ("Cuadro 2" antes que "Cuadro 10"), no alfabético. */
function ordenarCuadrosDe<T extends { cuadros: { cuadro: { nombre: string } }[]; realizadas: { cuadros: { cuadro: { nombre: string } }[] }[] }>(
  item: T
): T {
  item.cuadros = ordenarPorNombreNumerico(item.cuadros, (c) => c.cuadro.nombre);
  for (const r of item.realizadas) r.cuadros = ordenarPorNombreNumerico(r.cuadros, (c) => c.cuadro.nombre);
  return item;
}

/**
 * Por default no trae las "vencida" (liberadas) ni "cancelada" — se
 * quedaban en la lista para siempre sin forma de dejar de verlas (bug real
 * reportado por Diego, 31-ago-2026, ampliado a "cancelada" el mismo día).
 * Siguen existiendo en la base (no se borran, por trazabilidad de
 * Almacén); `incluirCerradas` las trae de vuelta.
 */
export async function listarGranular(huertaId?: string, incluirCerradas?: boolean) {
  const fertilizaciones = await prisma.fertilizacionGranular.findMany({
    where: { huertaId, ...(incluirCerradas ? {} : { estado: { notIn: ["vencida", "cancelada"] } }) },
    include: INCLUDE_GRANULAR,
    orderBy: { fechaCreacion: "desc" },
  });
  fertilizaciones.forEach(ordenarCuadrosDe);
  return Promise.all(fertilizaciones.map((f) => enriquecerConAlertas(f)));
}

export async function obtenerGranular(id: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({
    where: { id },
    include: INCLUDE_GRANULAR,
  });
  ordenarCuadrosDe(fertilizacion);
  return enriquecerConAlertas(fertilizacion);
}

/** Confirma la entrega física de TODOS los productos — acción de Almacén (Bodega), no de quien programó. */
export async function confirmarEntregaGranular(id: string, capturadoPorId: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id }, include: { productos: true } });
  if (fertilizacion.estado !== "programada") throw new TransicionFertilizacionInvalidaError("programada");

  return prisma.$transaction(async (tx) => {
    const comprometidos = await tx.almacenCentralMovimiento.findMany({ where: { referenciaId: id, tipo: "salida_comprometida" } });
    const faltaAlguno = fertilizacion.productos.some((p) => !comprometidos.some((m) => m.productoId === p.productoId));
    if (faltaAlguno) throw new StockNoComprometidoError();

    for (const p of fertilizacion.productos) {
      await confirmarEntregaComprometida(tx, p.productoId, fertilizacion.huertaId, Number(p.cantidadTotalCalculada), id, capturadoPorId);
    }
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
 * Descuenta el Almacén Local de cada producto de la fertilización,
 * proporcional al avance de ESTE reporte (10-ago-2026, varios productos):
 * el avance por Cuadro/hectáreas es uno solo, compartido — el descuento de
 * inventario es individual, cada producto de su propio saldo.
 */
async function descontarAlmacenLocalPorProductos(
  tx: TransactionClient,
  huertaId: string,
  productos: { productoId: string; cantidadTotalCalculada: Prisma.Decimal }[],
  hectareasEsteReporte: number,
  hectareasTotalesProgramadas: number,
  referenciaId: string,
  capturadoPorId: string
) {
  for (const p of productos) {
    const cantidadEsteReporte = (hectareasEsteReporte / hectareasTotalesProgramadas) * Number(p.cantidadTotalCalculada);
    const local = await tx.almacenLocal.upsert({
      where: { huertaId_productoId: { huertaId, productoId: p.productoId } },
      update: { cantidadReportadaAcumulada: { increment: cantidadEsteReporte } },
      create: { huertaId, productoId: p.productoId, cantidadReportadaAcumulada: cantidadEsteReporte },
    });
    await tx.almacenLocalMovimiento.create({
      data: { almacenLocalId: local.id, tipo: "consumo_reportado", cantidad: cantidadEsteReporte, referenciaId, capturadoPorId },
    });
  }
}

/**
 * Paso 2, Registrar como realizada (Supervisor) — solo después de entregada.
 * Mismo rediseño que Aplicaciones (9.7/9.5): captura Cuadro(s)+hectáreas por
 * reporte, con descuento proporcional del Almacén Local en cada reporte,
 * ahora por cada producto de la fertilización (10-ago-2026).
 */
export async function registrarRealizadaGranular(id: string, input: RegistrarRealizadaGranularInput, registradoPorId: string) {
  if (!input.personalId && !input.grupoId) throw new Error("Falta quién hizo la fertilización (persona o grupo).");
  if (!input.cuadros || input.cuadros.length === 0) throw new Error("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");

  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id }, include: { cuadros: true, productos: true } });
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

    await descontarAlmacenLocalPorProductos(
      tx,
      fertilizacion.huertaId,
      fertilizacion.productos,
      hectareasEsteReporte,
      Number(fertilizacion.hectareasTotalesProgramadas),
      id,
      registradoPorId
    );

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
    include: { fertilizacion: { include: { cuadros: true, productos: true } }, cuadros: true },
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

    for (const p of fertilizacion.productos) {
      const cantidadAntes = (hectareasAntes / base) * Number(p.cantidadTotalCalculada);
      const cantidadDespues = (hectareasDespues / base) * Number(p.cantidadTotalCalculada);
      const delta = cantidadDespues - cantidadAntes;
      if (Math.abs(delta) <= 0.0000001) continue;

      const local = await tx.almacenLocal.upsert({
        where: { huertaId_productoId: { huertaId: fertilizacion.huertaId, productoId: p.productoId } },
        update: { cantidadReportadaAcumulada: { increment: delta } },
        create: { huertaId: fertilizacion.huertaId, productoId: p.productoId, cantidadReportadaAcumulada: delta },
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
 * días, o cancelación manual). Libera el stock comprometido de cada
 * producto que sí llegó a apartarse. Solo aplica al caso "nunca salió de
 * bodega" — si ya se entregó al rancho, ver `cancelarGranularEntregada`.
 */
export async function liberarGranularVencida(id: string, capturadoPorId: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id }, include: { productos: true } });
  if (fertilizacion.estado !== "programada") throw new TransicionFertilizacionInvalidaError("programada");

  return prisma.$transaction(async (tx) => {
    for (const p of fertilizacion.productos) {
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
          "Liberación de fertilización granular vencida (15 días sin entregar) o cancelada manualmente."
        );
      }
    }
    // 1.5 (2-sep-2026): cualquier orden de compra ligada a esta
    // fertilización que todavía no haya llegado a Almacén se cancela junto.
    await cancelarOrdenesDeReferencia(tx, id);
    return tx.fertilizacionGranular.update({ where: { id }, data: { estado: "vencida" } });
  });
}

/** Protocolo de cancelación de fertilización granular entregada y vencida a 15 días — mismo mecanismo que Aplicaciones (9.7/9.5), por cada producto. */
export async function cancelarGranularEntregada(id: string, canceladaPorId: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id }, include: { productos: true } });
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

  return prisma.$transaction(async (tx) => {
    for (const p of fertilizacion.productos) {
      const cantidadARegresar = Number(p.cantidadTotalCalculada) * (1 - porcentajeAvance);

      const local = await tx.almacenLocal.update({
        where: { huertaId_productoId: { huertaId: fertilizacion.huertaId, productoId: p.productoId } },
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

      const lote = await tx.productoLote.findFirst({ where: { productoId: p.productoId } });
      if (lote) {
        await tx.productoLote.update({ where: { id: lote.id }, data: { cantidadActual: { increment: cantidadARegresar } } });
      } else {
        await tx.productoLote.create({ data: { productoId: p.productoId, lote: "ABONO", cantidadActual: cantidadARegresar } });
      }
      await tx.almacenCentralMovimiento.create({
        data: {
          productoId: p.productoId,
          tipo: "abono_sobrante",
          cantidad: cantidadARegresar,
          huertaDestinoId: fertilizacion.huertaId,
          referenciaId: id,
          capturadoPorId: canceladaPorId,
        },
      });
    }

    await cancelarOrdenesDeReferencia(tx, id);

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

/**
 * Cancelaciones de Fertilización Granular pendientes de confirmar por
 * Bodega (15-ago-2026) — mismo mecanismo que Aplicaciones (9.7), agregado
 * aquí porque nunca existió una lista para que Bodega las encontrara: la
 * función de confirmar ya existía, pero no había manera de descubrir cuáles
 * fertilizaciones canceladas seguían esperando la firma digital.
 */
export async function listarCancelacionesPendientesConfirmarGranular() {
  const fertilizaciones = await prisma.fertilizacionGranular.findMany({
    where: { estado: "cancelada", confirmacionBodegaPorId: null },
    include: { huerta: true, productos: { include: { producto: true } } },
    orderBy: { fechaCancelacion: "asc" },
  });
  const filas: {
    id: string;
    tipo: "cancelacion";
    origen: "granular";
    huerta: { nombre: string };
    producto: { nombreComercial: string; unidad: string };
    cantidadRegresada: number;
    fecha: string | null;
  }[] = [];
  for (const f of fertilizaciones) {
    for (const p of f.productos) {
      const abono = await prisma.almacenCentralMovimiento.findFirst({
        where: { referenciaId: f.id, tipo: "abono_sobrante", productoId: p.productoId },
      });
      const cantidadRegresada = abono ? Number(abono.cantidad) : 0;
      if (cantidadRegresada <= 0) continue;
      filas.push({
        id: f.id,
        tipo: "cancelacion",
        origen: "granular",
        huerta: { nombre: f.huerta.nombre },
        producto: { nombreComercial: p.producto.nombreComercial, unidad: p.producto.unidad },
        cantidadRegresada,
        fecha: f.fechaCancelacion ? f.fechaCancelacion.toISOString() : null,
      });
    }
  }
  return filas;
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
