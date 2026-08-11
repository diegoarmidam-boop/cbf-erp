import { calcularCantidadTotal, tarifaEfectiva, type ConcentracionUnidad } from "@cbf/shared";
import type { Prisma } from "@prisma/client";
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
import { registrarUsoDiarioAutomaticoTx, borrarUsoDiarioDeLineasTx } from "../equipos/uso-diario.js";
import { obtenerVersionVigente } from "../unidades-produccion/cuadros.js";
import { obtenerConfigNomina } from "../nomina/config.js";
import { aActividadCalc } from "../nomina/util.js";
import { diaEstaCerrado } from "../nomina/captura.js";

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

export class SuperficieExcedeCuadroReporteError extends Error {
  constructor(nombreCuadro: string, hectareasCuadro: number, hectareasAcumuladas: number) {
    super(
      `El Cuadro "${nombreCuadro}" tiene ${hectareasCuadro} ha, pero entre todos los reportes de esta aplicación se acumularían ${hectareasAcumuladas.toFixed(4)} ha — la suma no puede exceder la superficie del Cuadro.`
    );
  }
}

export class DiaCerradoAplicacionError extends Error {
  constructor() {
    super("La Huerta ya tiene cerrado el día de Nómina de este reporte — no se puede editar (candado de consistencia con Nómina).");
  }
}

export class NoSePuedeCancelarError extends Error {
  constructor(motivo: string) {
    super(motivo);
  }
}

export type ModalidadAplicacion = "mochila" | "turbina" | "aguilon";

export interface ProgramarAplicacionInput {
  huertaId: string;
  cuadroIds: string[];
  productoId: string;
  recursoSugerido: ModalidadAplicacion;
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
        recursoSugerido: input.recursoSugerido,
        concentracionValor: input.concentracionValor,
        concentracionUnidad: input.concentracionUnidad,
        litrosMezclaPorHa: input.litrosMezclaPorHa,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        cantidadTotalCalculada,
        hectareasTotalesProgramadas: hectareasTotales,
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
const INCLUDE_LINEA = { tractor: true, operador: true, implemento: true, personas: { include: { personal: true } } };

const INCLUDE_APLICACION = {
  huerta: true,
  producto: true,
  cuadros: { include: { cuadro: true } },
  realizadas: {
    include: { cuadros: { include: { cuadro: true } }, lineas: { include: INCLUDE_LINEA } },
    orderBy: { fechaReal: "desc" as const },
  },
};

export async function listarAplicaciones(huertaId?: string) {
  const aplicaciones = await prisma.aplicacion.findMany({
    where: { huertaId },
    include: INCLUDE_APLICACION,
    orderBy: { fechaCreacion: "desc" },
  });
  return Promise.all(aplicaciones.map((a) => enriquecerConAlertas(a)));
}

type AplicacionConRealizadas = {
  id: string;
  estado: string;
  fechaCreacion: Date;
  hectareasTotalesProgramadas: Prisma.Decimal;
  cuadros: { cuadroId: string; cuadro: { nombre: string } }[];
  realizadas: { id: string; cuadros: { cuadroId: string; hectareas: Prisma.Decimal }[]; lineas: { horas: Prisma.Decimal }[] }[];
};

/** Hectáreas restantes por Cuadro (9.7, 8-ago-2026): lo que falta de reportar de cada Cuadro programado, para mostrarlo visible en el siguiente reporte y no obligar al Supervisor a calcularlo de memoria. `excluirRealizadaId` se usa al editar un reporte existente. */
async function hectareasRestantesPorCuadro(aplicacion: AplicacionConRealizadas, excluirRealizadaId?: string): Promise<Record<string, number>> {
  const restantes: Record<string, number> = {};
  for (const { cuadroId } of aplicacion.cuadros) {
    const version = await obtenerVersionVigente(cuadroId);
    const totalCuadro = version ? Number(version.hectareas) : 0;
    const reportadas = aplicacion.realizadas
      .filter((r) => r.id !== excluirRealizadaId)
      .reduce((s, r) => s + r.cuadros.filter((c) => c.cuadroId === cuadroId).reduce((s2, c) => s2 + Number(c.hectareas), 0), 0);
    restantes[cuadroId] = Math.max(0, totalCuadro - reportadas);
  }
  return restantes;
}

async function enriquecerConAlertas<T extends AplicacionConRealizadas>(aplicacion: T, tx: TransactionClient | typeof prisma = prisma) {
  const comprometido = await tx.almacenCentralMovimiento.findFirst({
    where: { referenciaId: aplicacion.id, tipo: "salida_comprometida" },
  });
  const entrega = await tx.almacenCentralMovimiento.findFirst({
    where: { referenciaId: aplicacion.id, tipo: "salida_real" },
  });
  const diasSinEntregar = aplicacion.estado === "programada" ? Math.floor((Date.now() - aplicacion.fechaCreacion.getTime()) / 86_400_000) : null;
  const diasSinAplicar =
    (aplicacion.estado === "entregada" || aplicacion.estado === "realizada") && entrega
      ? Math.floor((Date.now() - entrega.fecha.getTime()) / 86_400_000)
      : null;

  const hectareasAvanzadas = aplicacion.realizadas.reduce((s, r) => s + r.cuadros.reduce((s2, c) => s2 + Number(c.hectareas), 0), 0);
  const horasHombreTotales = aplicacion.realizadas.reduce((s, r) => s + r.lineas.reduce((s2, l) => s2 + Number(l.horas), 0), 0);
  const porcentajeAvance = Number(aplicacion.hectareasTotalesProgramadas) > 0 ? (hectareasAvanzadas / Number(aplicacion.hectareasTotalesProgramadas)) * 100 : 0;
  const restantesPorCuadro = await hectareasRestantesPorCuadro(aplicacion);

  return {
    ...aplicacion,
    comprometido: !!comprometido,
    diasSinEntregar,
    alertaVencimiento: (diasSinEntregar ?? 0) > DIAS_VENCIMIENTO,
    diasSinAplicar,
    alertaPendienteAplicar: (diasSinAplicar ?? 0) > DIAS_VENCIMIENTO && porcentajeAvance < 100,
    hectareasAvanzadas,
    horasHombreTotales,
    porcentajeAvance,
    restantesPorCuadro,
  };
}

export async function obtenerAplicacion(id: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({
    where: { id },
    include: INCLUDE_APLICACION,
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

export interface CuadroAvanceInput {
  cuadroId: string;
  hectareas: number;
}

export interface LineaRealizadaInput {
  modalidad: ModalidadAplicacion;
  tractorId?: string;
  operadorId?: string;
  implementoId?: string;
  horas: number;
  personalIds: string[];
}

export interface RegistrarRealizadaInput {
  fechaReal: string;
  cuadros: CuadroAvanceInput[];
  lineas: LineaRealizadaInput[];
  casoExtraordinario?: boolean;
}

/**
 * Captura de maquinaria y personas por reporte (9.7, confirmado 8-ago-2026):
 * cada línea es una de las 3 modalidades fijas — Turbina/Aguilón exigen
 * Tractor+Operador+Implemento; Aguilón además necesita su propia gente
 * detrás; Mochila solo lleva gente, sin tractor/implemento; Turbina no
 * lleva gente extra (el operador ya está contado aparte).
 */
function validarLineas(lineas: LineaRealizadaInput[]) {
  if (!lineas || lineas.length === 0) {
    throw new Error("Falta capturar al menos una línea de recurso (Mochila, Turbina o Aguilón) en este reporte.");
  }
  for (const l of lineas) {
    if (l.modalidad === "mochila") {
      if (l.tractorId || l.operadorId || l.implementoId) {
        throw new Error("Una línea de Mochila no lleva tractor ni implemento.");
      }
      if (!l.personalIds || l.personalIds.length === 0) {
        throw new Error("Una línea de Mochila necesita al menos una persona.");
      }
    } else {
      if (!l.tractorId || !l.operadorId || !l.implementoId) {
        throw new Error(`Una línea de ${l.modalidad === "turbina" ? "Turbina" : "Aguilón"} necesita Tractor, Operador e Implemento.`);
      }
      if (l.modalidad === "turbina" && l.personalIds && l.personalIds.length > 0) {
        throw new Error("Una línea de Turbina no lleva gente extra detrás.");
      }
      if (l.modalidad === "aguilon" && (!l.personalIds || l.personalIds.length === 0)) {
        throw new Error("Una línea de Aguilón necesita al menos una persona detrás del tractor.");
      }
    }
  }
}

/** Personas que cobran mano de obra por esta línea — el operador (si aplica) más la lista de personas. */
function personasAPagarDeLinea(l: LineaRealizadaInput): string[] {
  return l.modalidad === "mochila" ? l.personalIds : [l.operadorId!, ...l.personalIds];
}

export class DiaCerradoRequiereCasoExtraordinarioError extends Error {
  constructor() {
    super(
      "La Huerta ya tiene cerrado el día de Nómina de esta fecha — para que este registro cuente, se necesita autorización de caso extraordinario (Encargado de Nóminas, Director General o Gerente Administrativo)."
    );
  }
}

/**
 * Candado (9.7): la suma acumulada de hectáreas reportadas de un mismo
 * Cuadro, a través de TODOS los reportes de una Aplicación, no puede
 * exceder la superficie vigente de ese Cuadro. `excluirRealizadaId` se usa
 * al editar un reporte existente, para no contar sus propias hectáreas
 * previas dos veces contra el candado.
 */
async function validarCandadoCuadrosReporte(aplicacionId: string, cuadros: CuadroAvanceInput[], excluirRealizadaId?: string) {
  for (const c of cuadros) {
    const yaReportadas = await prisma.aplicacionRealizadaCuadro.aggregate({
      _sum: { hectareas: true },
      where: {
        cuadroId: c.cuadroId,
        realizada: { aplicacionId, ...(excluirRealizadaId ? { id: { not: excluirRealizadaId } } : {}) },
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
 * Paso 2, Registrar como realizada (9.7) — solo después de la entrega.
 * Cada reporte captura qué Cuadro(s) se avanzaron y cuántas hectáreas de
 * cada uno (corrección de fondo 8-ago-2026): el descuento del Almacén
 * Local es proporcional a lo avanzado en ESE reporte específico, no el
 * total de la aplicación de un jalón — una aplicación casi nunca se hace
 * en un solo día.
 */
export async function registrarRealizada(aplicacionId: string, input: RegistrarRealizadaInput, registradoPorId: string) {
  validarLineas(input.lineas);
  if (!input.cuadros || input.cuadros.length === 0) throw new Error("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");

  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId }, include: { cuadros: true } });
  if (aplicacion.estado !== "entregada" && aplicacion.estado !== "realizada") {
    throw new Error(
      "No se ha entregado el producto a esta Huerta todavía — Almacén debe confirmar la entrega antes de registrar la aplicación como realizada."
    );
  }
  const cuadroIdsProgramados = new Set(aplicacion.cuadros.map((c) => c.cuadroId));
  for (const c of input.cuadros) {
    if (!cuadroIdsProgramados.has(c.cuadroId)) throw new Error("Uno de los Cuadros reportados no forma parte de esta aplicación.");
  }
  await validarCandadoCuadrosReporte(aplicacionId, input.cuadros);

  // Registro automático llegando después del cierre del día (9.11): no entra solo — exige caso extraordinario ya autorizado por el llamador (verificado en la ruta).
  if ((await diaEstaCerrado(aplicacion.huertaId, input.fechaReal)) && !input.casoExtraordinario) {
    throw new DiaCerradoRequiereCasoExtraordinarioError();
  }

  const actividad = await prisma.actividad.findFirstOrThrow({ where: { nombre: NOMBRE_ACTIVIDAD_APLICACION } });
  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
  const esPrimeraVezRealizada = aplicacion.estado === "entregada";

  const hectareasEsteReporte = input.cuadros.reduce((s, c) => s + c.hectareas, 0);
  const cantidadEsteReporte = (hectareasEsteReporte / Number(aplicacion.hectareasTotalesProgramadas)) * Number(aplicacion.cantidadTotalCalculada);

  return prisma.$transaction(async (tx) => {
    const realizada = await tx.aplicacionRealizada.create({
      data: {
        aplicacionId,
        fechaReal: new Date(input.fechaReal),
        registradoPorId,
        cuadros: { create: input.cuadros.map((c) => ({ cuadroId: c.cuadroId, hectareas: c.hectareas })) },
      },
    });

    await crearLineasYNomina(tx, realizada.id, aplicacion.huertaId, input, actividad.id, tarifaAplicada, registradoPorId);

    if (esPrimeraVezRealizada) {
      await tx.aplicacion.update({ where: { id: aplicacionId }, data: { estado: "realizada" } });
    }

    const local = await tx.almacenLocal.upsert({
      where: { huertaId_productoId: { huertaId: aplicacion.huertaId, productoId: aplicacion.productoId } },
      update: { cantidadReportadaAcumulada: { increment: cantidadEsteReporte } },
      create: { huertaId: aplicacion.huertaId, productoId: aplicacion.productoId, cantidadReportadaAcumulada: cantidadEsteReporte },
    });
    await tx.almacenLocalMovimiento.create({
      data: { almacenLocalId: local.id, tipo: "consumo_reportado", cantidad: cantidadEsteReporte, referenciaId: aplicacionId, capturadoPorId: registradoPorId },
    });

    return tx.aplicacionRealizada.findUniqueOrThrow({
      where: { id: realizada.id },
      include: { cuadros: { include: { cuadro: true } }, lineas: { include: INCLUDE_LINEA } },
    });
  });
}

/** Crea las líneas de un reporte + su mano de obra automática + su alimentación a Uso Diario — compartido entre crear y editar. */
async function crearLineasYNomina(
  tx: TransactionClient,
  realizadaId: string,
  huertaId: string,
  input: { cuadros: CuadroAvanceInput[]; lineas: LineaRealizadaInput[]; fechaReal: string },
  actividadId: string,
  tarifaAplicada: number,
  registradoPorId: string
) {
  const cuadroIdUnico = input.cuadros.length === 1 ? input.cuadros[0]!.cuadroId : undefined;
  const fecha = new Date(input.fechaReal);

  for (const linea of input.lineas) {
    const lineaCreada = await tx.aplicacionRealizadaLinea.create({
      data: {
        realizadaId,
        modalidad: linea.modalidad,
        tractorId: linea.tractorId,
        operadorId: linea.operadorId,
        implementoId: linea.implementoId,
        horas: linea.horas,
        personas: { create: linea.personalIds.map((personalId) => ({ personalId })) },
      },
    });

    for (const personalId of personasAPagarDeLinea(linea)) {
      await tx.registroNomina.create({
        data: {
          fecha,
          huertaId,
          cuadroId: cuadroIdUnico,
          personalId,
          actividadId,
          cantidad: linea.horas,
          tarifaAplicada,
          origen: "automatico_aplicacion",
          referenciaOrigenId: realizadaId,
          capturadoPorId: registradoPorId,
        },
      });
    }

    if (linea.modalidad !== "mochila") {
      await registrarUsoDiarioAutomaticoTx(tx, linea.tractorId!, fecha, linea.operadorId!, linea.horas, huertaId, lineaCreada.id);
    }
  }
}

export interface EditarRealizadaInput {
  cuadros: CuadroAvanceInput[];
  lineas: LineaRealizadaInput[];
}

/**
 * Historial de reportes editable por separado (9.7) — sujeto al candado de
 * consistencia con Nómina (bloqueado si la Huerta/fecha del reporte ya
 * tiene el día cerrado) y al mismo candado de superficie por Cuadro. El
 * Almacén Local se ajusta por la diferencia entre lo que decía antes y lo
 * que dice ahora, nunca se vuelve a descontar el total completo. Líneas,
 * mano de obra automática y Uso Diario automático se reemplazan completos
 * (borrar y recrear) — más simple y seguro que intentar diferenciar línea
 * por línea qué cambió.
 */
export async function editarRealizada(realizadaId: string, input: EditarRealizadaInput, editadoPorId: string) {
  validarLineas(input.lineas);
  if (!input.cuadros || input.cuadros.length === 0) throw new Error("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");

  const realizada = await prisma.aplicacionRealizada.findUniqueOrThrow({
    where: { id: realizadaId },
    include: { aplicacion: { include: { cuadros: true } }, cuadros: true, lineas: true },
  });
  const fechaISO = realizada.fechaReal.toISOString().slice(0, 10);
  if (await diaEstaCerrado(realizada.aplicacion.huertaId, fechaISO)) throw new DiaCerradoAplicacionError();

  const cuadroIdsProgramados = new Set(realizada.aplicacion.cuadros.map((c) => c.cuadroId));
  for (const c of input.cuadros) {
    if (!cuadroIdsProgramados.has(c.cuadroId)) throw new Error("Uno de los Cuadros reportados no forma parte de esta aplicación.");
  }
  await validarCandadoCuadrosReporte(realizada.aplicacionId, input.cuadros, realizadaId);

  const aplicacion = realizada.aplicacion;
  const hectareasAntes = realizada.cuadros.reduce((s, c) => s + Number(c.hectareas), 0);
  const hectareasDespues = input.cuadros.reduce((s, c) => s + c.hectareas, 0);
  const base = Number(aplicacion.hectareasTotalesProgramadas);
  const cantidadAntes = (hectareasAntes / base) * Number(aplicacion.cantidadTotalCalculada);
  const cantidadDespues = (hectareasDespues / base) * Number(aplicacion.cantidadTotalCalculada);
  const delta = cantidadDespues - cantidadAntes;

  const actividad = await prisma.actividad.findFirstOrThrow({ where: { nombre: NOMBRE_ACTIVIDAD_APLICACION } });
  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
  const lineaIdsAnteriores = realizada.lineas.map((l) => l.id);

  return prisma.$transaction(async (tx) => {
    await tx.aplicacionRealizadaCuadro.deleteMany({ where: { realizadaId } });
    await tx.aplicacionRealizadaCuadro.createMany({
      data: input.cuadros.map((c) => ({ realizadaId, cuadroId: c.cuadroId, hectareas: c.hectareas })),
    });

    await borrarUsoDiarioDeLineasTx(tx, lineaIdsAnteriores);
    await tx.registroNomina.deleteMany({ where: { origen: "automatico_aplicacion", referenciaOrigenId: realizadaId } });
    await tx.aplicacionRealizadaLineaPersona.deleteMany({ where: { lineaId: { in: lineaIdsAnteriores } } });
    await tx.aplicacionRealizadaLinea.deleteMany({ where: { realizadaId } });

    await crearLineasYNomina(
      tx,
      realizadaId,
      aplicacion.huertaId,
      { cuadros: input.cuadros, lineas: input.lineas, fechaReal: fechaISO },
      actividad.id,
      tarifaAplicada,
      editadoPorId
    );

    if (Math.abs(delta) > 0.0000001) {
      const local = await tx.almacenLocal.upsert({
        where: { huertaId_productoId: { huertaId: aplicacion.huertaId, productoId: aplicacion.productoId } },
        update: { cantidadReportadaAcumulada: { increment: delta } },
        create: { huertaId: aplicacion.huertaId, productoId: aplicacion.productoId, cantidadReportadaAcumulada: delta },
      });
      await tx.almacenLocalMovimiento.create({
        data: {
          almacenLocalId: local.id,
          tipo: "ajuste_manual",
          cantidad: delta,
          referenciaId: aplicacion.id,
          capturadoPorId: editadoPorId,
        },
      });
    }

    return tx.aplicacionRealizada.findUniqueOrThrow({
      where: { id: realizadaId },
      include: { cuadros: { include: { cuadro: true } }, lineas: { include: INCLUDE_LINEA } },
    });
  });
}

/**
 * Cierra una aplicación programada que nunca se entregó — ya sea porque
 * pasaron los 15 días de vencimiento (9.7) o por cancelación manual de
 * Dirección/Gerencia Técnica. Libera el stock comprometido si lo había.
 * Solo aplica al caso "nunca salió de bodega" — si ya se entregó al rancho,
 * ver `cancelarAplicacionEntregada`.
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

/**
 * Protocolo de cancelación de aplicación entregada y vencida a 15 días
 * (9.7, reemplaza "Liberar" para este caso): el producto ya llegó al
 * rancho pero no se terminó de aplicar. Es el proceso inverso a la salida
 * de Almacén hacia el campo — revierte solo la porción NO aplicada
 * (proporcional a lo que sí quedó reportado como avance real). El ajuste
 * de inventario ocurre de inmediato; la confirmación de Bodega es un paso
 * de registro aparte que no lo bloquea (ver `confirmarRecepcionCancelacion`).
 */
export async function cancelarAplicacionEntregada(aplicacionId: string, canceladaPorId: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId } });
  if (aplicacion.estado !== "entregada" && aplicacion.estado !== "realizada") {
    throw new NoSePuedeCancelarError("Solo se puede cancelar una aplicación que ya fue entregada al rancho.");
  }

  const entrega = await prisma.almacenCentralMovimiento.findFirst({ where: { referenciaId: aplicacionId, tipo: "salida_real" } });
  if (!entrega) throw new NoSePuedeCancelarError("No se encontró la entrega de esta aplicación.");
  const diasSinAplicar = Math.floor((Date.now() - entrega.fecha.getTime()) / 86_400_000);
  if (diasSinAplicar <= DIAS_VENCIMIENTO) {
    throw new NoSePuedeCancelarError(`Todavía no pasan los ${DIAS_VENCIMIENTO} días desde la entrega — lleva ${diasSinAplicar}.`);
  }

  const avanzadas = await prisma.aplicacionRealizadaCuadro.aggregate({
    _sum: { hectareas: true },
    where: { realizada: { aplicacionId } },
  });
  const hectareasAvanzadas = Number(avanzadas._sum.hectareas ?? 0);
  const porcentajeAvance = hectareasAvanzadas / Number(aplicacion.hectareasTotalesProgramadas);
  if (porcentajeAvance >= 0.9999) {
    throw new NoSePuedeCancelarError("Esta aplicación ya quedó completamente aplicada — no hay nada que cancelar.");
  }

  const cantidadARegresar = Number(aplicacion.cantidadTotalCalculada) * (1 - porcentajeAvance);

  return prisma.$transaction(async (tx) => {
    const local = await tx.almacenLocal.update({
      where: { huertaId_productoId: { huertaId: aplicacion.huertaId, productoId: aplicacion.productoId } },
      data: { cantidadRecibidaAcumulada: { decrement: cantidadARegresar } },
    });
    await tx.almacenLocalMovimiento.create({
      data: {
        almacenLocalId: local.id,
        tipo: "ajuste_manual",
        cantidad: -cantidadARegresar,
        referenciaId: aplicacionId,
        capturadoPorId: canceladaPorId,
      },
    });

    const lote = await tx.productoLote.findFirst({ where: { productoId: aplicacion.productoId } });
    if (lote) {
      await tx.productoLote.update({ where: { id: lote.id }, data: { cantidadActual: { increment: cantidadARegresar } } });
    } else {
      await tx.productoLote.create({ data: { productoId: aplicacion.productoId, lote: "ABONO", cantidadActual: cantidadARegresar } });
    }
    await tx.almacenCentralMovimiento.create({
      data: {
        productoId: aplicacion.productoId,
        tipo: "abono_sobrante",
        cantidad: cantidadARegresar,
        huertaDestinoId: aplicacion.huertaId,
        referenciaId: aplicacionId,
        capturadoPorId: canceladaPorId,
      },
    });

    return tx.aplicacion.update({
      where: { id: aplicacionId },
      data: { estado: "cancelada", canceladaPorId, fechaCancelacion: new Date() },
    });
  });
}

/** Firma digital de recepción del Encargado de Bodega (9.7) — confirma que el producto devuelto ya llegó físicamente. */
export async function confirmarRecepcionCancelacion(aplicacionId: string, confirmadoPorId: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId } });
  if (aplicacion.estado !== "cancelada") {
    throw new NoSePuedeCancelarError("Esta aplicación no está cancelada — no hay nada que confirmar.");
  }
  if (aplicacion.confirmacionBodegaPorId) {
    throw new NoSePuedeCancelarError("Ya se había confirmado la recepción de esta cancelación.");
  }
  return prisma.aplicacion.update({
    where: { id: aplicacionId },
    data: { confirmacionBodegaPorId: confirmadoPorId, fechaConfirmacionBodega: new Date() },
  });
}

/** Catálogo de agroquímicos ya autorizados — lo único elegible al programar (9.7). */
export function productosParaAplicacion() {
  return productosAutorizados("agroquimico");
}

/** Implementos elegibles en una línea de Turbina/Aguilón (9.7/9.13). */
export function equiposImplementoParaAplicacion() {
  return listarEquipos("implemento");
}

/** Tractores elegibles en una línea de Turbina/Aguilón (9.7/9.13). */
export function equiposTractorParaAplicacion() {
  return listarEquipos("tractor");
}
