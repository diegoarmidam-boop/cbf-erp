import { calcularCantidadTotal, calcularMezclaPorTanque, tarifaEfectiva, type ConcentracionUnidad } from "@cbf/shared";
import type { Prisma, Rol } from "@prisma/client";
import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
import { productosAutorizados } from "../almacen/productos.js";
import { actualizarDosisProductoEnReceta, obtenerReceta, ROLES_RECETAS } from "../recetario/recetario.js";
import {
  ajustarCantidadProducto,
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
    super("Uno de los productos elegidos no es un agroquímico autorizado — no se puede programar una aplicación con él.");
  }
}

export class TransicionAplicacionInvalidaError extends Error {
  constructor(esperado: string) {
    super(`Esta aplicación no está en estado "${esperado}".`);
  }
}

export class StockNoComprometidoError extends Error {
  constructor() {
    super("Todavía no hay suficiente stock apartado para todos los productos de esta aplicación — espera a que llegue la compra automática.");
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

export interface ProductoAplicacionInput {
  productoId: string;
  concentracionValor: number;
  concentracionUnidad: ConcentracionUnidad;
}

export interface ProgramarAplicacionInput {
  huertaId: string;
  cuadroIds: string[];
  productos: ProductoAplicacionInput[];
  recursoSugerido: ModalidadAplicacion;
  litrosMezclaPorHa: number;
  fechaInicio: string;
  fechaFin: string;
  // Recetario (20-ago-2026): recetaId es solo trazabilidad de "de dónde
  // salió esta programación" — los productos/dosis reales a aplicar siguen
  // viniendo de `productos`/`litrosMezclaPorHa` de arriba (precargados de la
  // receta en el frontend, editables). capacidadTanque es opcional y
  // universal — aplica con o sin receta, cualquier Aplicación con producto
  // líquido por hectárea puede pedir el desglose por tanque.
  recetaId?: string;
  capacidadTanque?: number;
  // Si viene una receta y el rol autorizado ajustó la dosis: además de usar
  // la dosis nueva en esta programación, actualiza también la receta
  // maestra para las próximas veces.
  actualizarRecetaOriginal?: boolean;
}

export class RolNoPuedeAjustarRecetaError extends Error {
  constructor() {
    super("Tu rol solo puede usar esta receta tal cual está guardada — no puede cambiar la dosis. Pide a Dirección General o al Gerente Técnico de Producción que la ajuste.");
  }
}

/**
 * Recetario (20-ago-2026): valida que, si la programación viene de una
 * receta y quien la captura NO es Director General/Gerente Técnico de
 * Producción, la dosis (litros/ha compartido + concentración de cada
 * producto) coincida EXACTO con lo guardado en la receta — el candado real
 * vive aquí, no solo en que el frontend muestre el campo de solo lectura
 * (cualquiera podría llamar la API directo). Devuelve la receta cargada
 * para reutilizarla si aplica "actualizar receta original".
 */
async function validarUsoDeReceta(
  recetaId: string,
  usuarioRol: Rol,
  litrosMezclaPorHa: number,
  productos: ProductoAplicacionInput[]
) {
  const receta = await obtenerReceta(recetaId);
  if (!ROLES_RECETAS.includes(usuarioRol)) {
    const mismaAgua = Number(receta.litrosPorHa) === litrosMezclaPorHa;
    const mismasDosis = receta.productos.every((rp) => {
      const enviado = productos.find((p) => p.productoId === rp.productoId);
      return enviado && Number(rp.concentracionValor) === enviado.concentracionValor && rp.concentracionUnidad === enviado.concentracionUnidad;
    });
    if (!mismaAgua || !mismasDosis || receta.productos.length !== productos.length) {
      throw new RolNoPuedeAjustarRecetaError();
    }
  }
  return receta;
}

/**
 * Paso 1, Programar (9.7): calcula la cantidad total de cada producto (10-
 * ago-2026, varios productos en el mismo tanque — comparten litrosMezclaPorHa,
 * cada uno con su propia concentración), y para cada uno, si el Almacén
 * alcanza la aparta de inmediato ("comprometido"); si no alcanza, no
 * bloquea — genera automático una orden de Compras por el faltante, sin
 * requerir autorización adicional (ya la trae de quien programó). Cada
 * producto se autoriza/aparta/compra por separado, aunque se programen juntos.
 */
export async function programarAplicacion(input: ProgramarAplicacionInput, creadoPorId: string, usuarioRol: Rol) {
  if (input.cuadroIds.length === 0) {
    throw new Error("Elige al menos un Cuadro.");
  }
  if (!input.productos || input.productos.length === 0) {
    throw new Error("Elige al menos un producto.");
  }
  const productos = await prisma.producto.findMany({ where: { id: { in: input.productos.map((p) => p.productoId) } } });
  for (const p of productos) {
    if (p.categoria !== "agroquimico" || !p.autorizado) {
      throw new ProductoNoAutorizadoAplicacionError();
    }
  }

  if (input.recetaId) {
    await validarUsoDeReceta(input.recetaId, usuarioRol, input.litrosMezclaPorHa, input.productos);
    if (input.actualizarRecetaOriginal) {
      for (const p of input.productos) {
        await actualizarDosisProductoEnReceta(input.recetaId, p.productoId, p.concentracionValor, p.concentracionUnidad);
      }
    }
  }

  let hectareasTotales = 0;
  const fechaRef = new Date(input.fechaInicio);
  for (const cuadroId of input.cuadroIds) {
    const version = await obtenerVersionVigente(cuadroId, fechaRef);
    if (!version) throw new Error(`El Cuadro elegido no tiene una configuración vigente para la fecha de inicio.`);
    hectareasTotales += Number(version.hectareas);
  }

  return prisma.$transaction(async (tx) => {
    const aplicacion = await tx.aplicacion.create({
      data: {
        huertaId: input.huertaId,
        recursoSugerido: input.recursoSugerido,
        litrosMezclaPorHa: input.litrosMezclaPorHa,
        recetaId: input.recetaId,
        capacidadTanque: input.capacidadTanque,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        hectareasTotalesProgramadas: hectareasTotales,
        creadoPorId,
      },
    });
    await tx.aplicacionCuadro.createMany({
      data: input.cuadroIds.map((cuadroId) => ({ aplicacionId: aplicacion.id, cuadroId })),
    });

    for (const p of input.productos) {
      const cantidadTotalCalculada = calcularCantidadTotal(p.concentracionValor, p.concentracionUnidad, input.litrosMezclaPorHa, hectareasTotales);
      await tx.aplicacionProducto.create({
        data: {
          aplicacionId: aplicacion.id,
          productoId: p.productoId,
          concentracionValor: p.concentracionValor,
          concentracionUnidad: p.concentracionUnidad,
          cantidadTotalCalculada,
        },
      });

      const comprometido = await intentarComprometer(tx, p.productoId, cantidadTotalCalculada, aplicacion.id, creadoPorId);
      if (!comprometido) {
        const disponible = await stockTotalProductoTx(tx, p.productoId);
        const faltante = cantidadTotalCalculada - disponible;
        await tx.ordenCompra.create({
          data: {
            origen: "automatica",
            productoId: p.productoId,
            cantidadSolicitada: faltante,
            estado: "pendiente_cotizar",
            referenciaAplicacionId: aplicacion.id,
            creadoPorId,
          },
        });
      }
    }
    return aplicacion;
  });
}

export class YaHayAvanceReportadoError extends Error {
  constructor() {
    super("Esta Aplicación ya tiene reportes de avance — no se puede editar la dosis, cancélala y reprograma con los datos correctos.");
  }
}

/**
 * Editar el Paso 1 de una Aplicación ya programada/entregada (9.7,
 * 15-ago-2026, reabre decisión previa): permitido mientras no exista ningún
 * reporte de avance todavía (nada se ha usado de verdad, así que se puede
 * ajustar el 100% de cada producto sin cálculos proporcionales). Por
 * producto, según cómo cambia la cantidad total:
 * - Sube: intenta apartar la diferencia del Almacén Central; si no alcanza,
 *   genera automático el pendiente en Compras por la diferencia completa
 *   (mismo criterio que programar por primera vez). Si la Aplicación ya
 *   estaba "entregada", la diferencia apartada se entrega de inmediato
 *   también — no se deja a medio entregar.
 * - Baja: el sobrante se libera. Si todavía no se había entregado, basta
 *   con liberar el compromiso (el producto nunca salió de la bodega). Si ya
 *   se había entregado, el sobrante se regresa del Almacén Local de la
 *   Huerta al Central como abono — mismo mecanismo que la cancelación,
 *   pero queda marcado `confirmado: false` hasta que Bodega confirme que
 *   ya le llegó físicamente de vuelta.
 * Productos quitados de la edición se tratan como baja completa; productos
 * nuevos, como alta completa.
 */
export async function editarAplicacionProgramada(aplicacionId: string, input: Omit<ProgramarAplicacionInput, "huertaId">, editadoPorId: string, usuarioRol: Rol) {
  if (input.cuadroIds.length === 0) throw new Error("Elige al menos un Cuadro.");
  if (!input.productos || input.productos.length === 0) throw new Error("Elige al menos un producto.");

  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({
    where: { id: aplicacionId },
    include: { productos: true, realizadas: true },
  });
  if (aplicacion.estado !== "programada" && aplicacion.estado !== "entregada") {
    throw new TransicionAplicacionInvalidaError("programada o entregada");
  }
  if (aplicacion.realizadas.length > 0) throw new YaHayAvanceReportadoError();

  const productosNuevos = await prisma.producto.findMany({ where: { id: { in: input.productos.map((p) => p.productoId) } } });
  for (const p of productosNuevos) {
    if (p.categoria !== "agroquimico" || !p.autorizado) throw new ProductoNoAutorizadoAplicacionError();
  }

  const recetaId = input.recetaId ?? aplicacion.recetaId ?? undefined;
  if (recetaId) {
    await validarUsoDeReceta(recetaId, usuarioRol, input.litrosMezclaPorHa, input.productos);
    if (input.actualizarRecetaOriginal) {
      for (const p of input.productos) {
        await actualizarDosisProductoEnReceta(recetaId, p.productoId, p.concentracionValor, p.concentracionUnidad);
      }
    }
  }

  let hectareasTotales = 0;
  const fechaRef = new Date(input.fechaInicio);
  for (const cuadroId of input.cuadroIds) {
    const version = await obtenerVersionVigente(cuadroId, fechaRef);
    if (!version) throw new Error("El Cuadro elegido no tiene una configuración vigente para la fecha de inicio.");
    hectareasTotales += Number(version.hectareas);
  }

  const entregada = aplicacion.estado === "entregada";

  return prisma.$transaction(async (tx) => {
    const productosAnteriores = new Map(aplicacion.productos.map((p) => [p.productoId, p]));
    const productoIdsNuevos = new Set(input.productos.map((p) => p.productoId));

    // Productos quitados por completo de la edición: baja de 100% de lo apartado.
    for (const anterior of aplicacion.productos) {
      if (productoIdsNuevos.has(anterior.productoId)) continue;
      await ajustarCantidadProducto(tx, aplicacion.huertaId, aplicacionId, anterior.productoId, Number(anterior.cantidadTotalCalculada), 0, entregada, editadoPorId);
      await tx.aplicacionProducto.delete({ where: { id: anterior.id } });
    }

    for (const p of input.productos) {
      const cantidadNueva = calcularCantidadTotal(p.concentracionValor, p.concentracionUnidad, input.litrosMezclaPorHa, hectareasTotales);
      const anterior = productosAnteriores.get(p.productoId);
      const cantidadAnterior = anterior ? Number(anterior.cantidadTotalCalculada) : 0;

      await ajustarCantidadProducto(tx, aplicacion.huertaId, aplicacionId, p.productoId, cantidadAnterior, cantidadNueva, entregada, editadoPorId);

      if (anterior) {
        await tx.aplicacionProducto.update({
          where: { id: anterior.id },
          data: { concentracionValor: p.concentracionValor, concentracionUnidad: p.concentracionUnidad, cantidadTotalCalculada: cantidadNueva },
        });
      } else {
        await tx.aplicacionProducto.create({
          data: {
            aplicacionId,
            productoId: p.productoId,
            concentracionValor: p.concentracionValor,
            concentracionUnidad: p.concentracionUnidad,
            cantidadTotalCalculada: cantidadNueva,
          },
        });
      }
    }

    await tx.aplicacionCuadro.deleteMany({ where: { aplicacionId } });
    await tx.aplicacionCuadro.createMany({ data: input.cuadroIds.map((cuadroId) => ({ aplicacionId, cuadroId })) });

    return tx.aplicacion.update({
      where: { id: aplicacionId },
      data: {
        recursoSugerido: input.recursoSugerido,
        litrosMezclaPorHa: input.litrosMezclaPorHa,
        capacidadTanque: input.capacidadTanque,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        hectareasTotalesProgramadas: hectareasTotales,
      },
    });
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
  productos: { include: { producto: true } },
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
  litrosMezclaPorHa: Prisma.Decimal;
  capacidadTanque: Prisma.Decimal | null;
  productos: { productoId: string; cantidadTotalCalculada: Prisma.Decimal; concentracionValor: Prisma.Decimal; concentracionUnidad: ConcentracionUnidad }[];
  cuadros: { cuadroId: string; cuadro: { nombre: string } }[];
  realizadas: { id: string; cuadros: { cuadroId: string; hectareas: Prisma.Decimal }[]; lineas: { horas: Prisma.Decimal }[] }[];
};

/**
 * Mezcla por tanque (bloque nuevo, 20-ago-2026): calculado al vuelo a
 * partir de datos ya guardados (concentración, litros de mezcla/ha,
 * hectáreas totales, capacidad del tanque) — no se persiste, para que
 * nunca quede desactualizado si algo de eso cambia. Null si esta
 * Aplicación no capturó capacidad de tanque (sigue funcionando igual sin
 * el desglose, es opcional).
 */
function calcularMezclaPorTanqueDeAplicacion(aplicacion: AplicacionConRealizadas) {
  if (aplicacion.capacidadTanque == null) return null;
  const litrosMezclaPorHa = Number(aplicacion.litrosMezclaPorHa);
  const capacidadTanque = Number(aplicacion.capacidadTanque);
  const hectareasTotales = Number(aplicacion.hectareasTotalesProgramadas);
  return aplicacion.productos.map((p) => ({
    productoId: p.productoId,
    ...calcularMezclaPorTanque(Number(p.concentracionValor), p.concentracionUnidad, litrosMezclaPorHa, capacidadTanque, hectareasTotales),
  }));
}

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
  // Comprometido/entregado a nivel Aplicación = TODOS sus productos lo están
  // (10-ago-2026, varios productos): si uno todavía espera compra, la
  // Aplicación completa se queda en "programada" hasta que los demás alcancen.
  const movimientosComprometido = await tx.almacenCentralMovimiento.findMany({
    where: { referenciaId: aplicacion.id, tipo: "salida_comprometida" },
  });
  const movimientosEntrega = await tx.almacenCentralMovimiento.findMany({
    where: { referenciaId: aplicacion.id, tipo: "salida_real" },
  });
  const comprometido = aplicacion.productos.every((p) => movimientosComprometido.some((m) => m.productoId === p.productoId));
  const entrega = movimientosEntrega[0];

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
    comprometido,
    diasSinEntregar,
    alertaVencimiento: (diasSinEntregar ?? 0) > DIAS_VENCIMIENTO,
    diasSinAplicar,
    alertaPendienteAplicar: (diasSinAplicar ?? 0) > DIAS_VENCIMIENTO && porcentajeAvance < 100,
    hectareasAvanzadas,
    horasHombreTotales,
    porcentajeAvance,
    restantesPorCuadro,
    mezclaPorTanque: calcularMezclaPorTanqueDeAplicacion(aplicacion),
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
 * Confirma la entrega física de TODOS los productos a la Huerta (9.7) —
 * acción de Almacén, no de quien programó. Solo puede pasar si ya hay stock
 * comprometido para cada producto de esta aplicación.
 */
export async function confirmarEntrega(aplicacionId: string, capturadoPorId: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId }, include: { productos: true } });
  if (aplicacion.estado !== "programada") throw new TransicionAplicacionInvalidaError("programada");

  return prisma.$transaction(async (tx) => {
    const comprometidos = await tx.almacenCentralMovimiento.findMany({
      where: { referenciaId: aplicacionId, tipo: "salida_comprometida" },
    });
    const faltaAlguno = aplicacion.productos.some((p) => !comprometidos.some((m) => m.productoId === p.productoId));
    if (faltaAlguno) throw new StockNoComprometidoError();

    for (const p of aplicacion.productos) {
      await confirmarEntregaComprometida(tx, p.productoId, aplicacion.huertaId, Number(p.cantidadTotalCalculada), aplicacionId, capturadoPorId);
    }
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
 * cada línea es una de las 3 modalidades fijas. Turbina/Aguilón exigen
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
 * Descuenta el Almacén Local de cada producto de la Aplicación, proporcional
 * al avance de ESTE reporte (10-ago-2026, varios productos): el avance por
 * Cuadro/hectáreas es uno solo, compartido para toda la mezcla — pero el
 * descuento de inventario es individual, cada producto de su propio saldo.
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

  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId }, include: { cuadros: true, productos: true } });
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

    await descontarAlmacenLocalPorProductos(
      tx,
      aplicacion.huertaId,
      aplicacion.productos,
      hectareasEsteReporte,
      Number(aplicacion.hectareasTotalesProgramadas),
      aplicacionId,
      registradoPorId
    );

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
    include: { aplicacion: { include: { cuadros: true, productos: true } }, cuadros: true, lineas: true },
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

    for (const p of aplicacion.productos) {
      const cantidadAntes = (hectareasAntes / base) * Number(p.cantidadTotalCalculada);
      const cantidadDespues = (hectareasDespues / base) * Number(p.cantidadTotalCalculada);
      const delta = cantidadDespues - cantidadAntes;
      if (Math.abs(delta) <= 0.0000001) continue;

      const local = await tx.almacenLocal.upsert({
        where: { huertaId_productoId: { huertaId: aplicacion.huertaId, productoId: p.productoId } },
        update: { cantidadReportadaAcumulada: { increment: delta } },
        create: { huertaId: aplicacion.huertaId, productoId: p.productoId, cantidadReportadaAcumulada: delta },
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
 * Dirección/Gerencia Técnica. Libera el stock comprometido de cada
 * producto que sí llegó a apartarse. Solo aplica al caso "nunca salió de
 * bodega" — si ya se entregó al rancho, ver `cancelarAplicacionEntregada`.
 */
export async function liberarAplicacionVencida(aplicacionId: string, capturadoPorId: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId }, include: { productos: true } });
  if (aplicacion.estado !== "programada") throw new TransicionAplicacionInvalidaError("programada");

  return prisma.$transaction(async (tx) => {
    for (const p of aplicacion.productos) {
      const comprometido = await tx.almacenCentralMovimiento.findFirst({
        where: { referenciaId: aplicacionId, tipo: "salida_comprometida", productoId: p.productoId },
      });
      if (comprometido) {
        await liberarComprometido(
          tx,
          p.productoId,
          Number(p.cantidadTotalCalculada),
          aplicacionId,
          capturadoPorId,
          "Liberación de aplicación vencida (15 días sin entregar) o cancelada manualmente."
        );
      }
    }
    return tx.aplicacion.update({ where: { id: aplicacionId }, data: { estado: "vencida" } });
  });
}

/**
 * Protocolo de cancelación de aplicación entregada y vencida a 15 días
 * (9.7, reemplaza "Liberar" para este caso): el producto ya llegó al
 * rancho pero no se terminó de aplicar. Es el proceso inverso a la salida
 * de Almacén hacia el campo — revierte solo la porción NO aplicada
 * (proporcional a lo que sí quedó reportado como avance real), para CADA
 * producto de la Aplicación por separado (10-ago-2026, varios productos).
 * El ajuste de inventario ocurre de inmediato; la confirmación de Bodega es
 * un paso de registro aparte que no lo bloquea (ver `confirmarRecepcionCancelacion`).
 */
export async function cancelarAplicacionEntregada(aplicacionId: string, canceladaPorId: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId }, include: { productos: true } });
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

  return prisma.$transaction(async (tx) => {
    for (const p of aplicacion.productos) {
      const cantidadARegresar = Number(p.cantidadTotalCalculada) * (1 - porcentajeAvance);

      const local = await tx.almacenLocal.update({
        where: { huertaId_productoId: { huertaId: aplicacion.huertaId, productoId: p.productoId } },
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
          huertaDestinoId: aplicacion.huertaId,
          referenciaId: aplicacionId,
          capturadoPorId: canceladaPorId,
        },
      });
    }

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

/**
 * Cancelaciones entregadas y esperando la firma digital de recepción del
 * Encargado de Bodega (9.7). Vive aparte de `listarAplicaciones` porque
 * Bodega no tiene permiso sobre el módulo de Aplicaciones (ver matriz de
 * permisos, 9.7) — el módulo no le aparece en el menú (regla del bloque 4),
 * así que esta lista se expone bajo el permiso de Almacén en vez del de
 * Aplicaciones, para que sí le llegue el aviso de que se le va a regresar
 * producto. Con varios productos (10-ago-2026), el aviso lista cada uno con
 * su propia cantidad a regresar.
 */
export async function listarCancelacionesPendientesConfirmar() {
  const aplicaciones = await prisma.aplicacion.findMany({
    where: { estado: "cancelada", confirmacionBodegaPorId: null },
    include: { huerta: true, productos: { include: { producto: true } } },
    orderBy: { fechaCancelacion: "asc" },
  });
  // Aplanado uno por producto (corregido 15-ago-2026: esta función devolvía
  // `productos: [...]` agrupado, pero el tipo/pantalla del frontend siempre
  // esperó un renglón por producto — con más de un producto por cancelación
  // el acceso a `.producto.nombreComercial` habría tronado en tiempo real).
  const filas: {
    id: string;
    tipo: "cancelacion";
    origen: "aplicacion";
    huerta: { nombre: string };
    producto: { nombreComercial: string; unidad: string };
    cantidadRegresada: number;
    fecha: string | null;
  }[] = [];
  for (const a of aplicaciones) {
    for (const p of a.productos) {
      const abono = await prisma.almacenCentralMovimiento.findFirst({
        where: { referenciaId: a.id, tipo: "abono_sobrante", productoId: p.productoId },
      });
      const cantidadRegresada = abono ? Number(abono.cantidad) : 0;
      if (cantidadRegresada <= 0) continue;
      filas.push({
        id: a.id,
        tipo: "cancelacion",
        origen: "aplicacion",
        huerta: { nombre: a.huerta.nombre },
        producto: { nombreComercial: p.producto.nombreComercial, unidad: p.producto.unidad },
        cantidadRegresada,
        fecha: a.fechaCancelacion ? a.fechaCancelacion.toISOString() : null,
      });
    }
  }
  return filas;
}

// listarAjustesPendientesConfirmar y confirmarRecepcionAjuste (15-ago-2026)
// viven en almacen/movimientos.ts — son genéricas por movimiento, no
// dependen de si el origen fue una Aplicación o una Fertilización Granular.

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
