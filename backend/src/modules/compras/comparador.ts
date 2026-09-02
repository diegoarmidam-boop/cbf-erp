import { calcularAhorroForaneo, calcularCotizacion, type MonedaCotizacion } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { siguienteFolio } from "../../core/contador.js";

export interface CotizacionInput {
  proveedorId: string;
  zonaId: string;
  nombreComercial: string;
  moneda: MonedaCotizacion;
  precioValor: number;
  tipoCambio?: number;
  presentacionCantidad: number;
}

/**
 * Comparador = paso real de "Cotizar" del ciclo de Compras (2-sep-2026,
 * 1.1-1.6) — ya no es una herramienta de análisis aparte. Toda Comparación
 * nueva liga a la OrdenCompra "necesidad" (pendiente_cotizar) que está
 * cotizando; productoId/cantidadNecesaria/unidad se copian de ahí, no se
 * vuelven a capturar.
 */
export interface CrearComparacionInput {
  ordenCompraId: string;
  umbralExcedentePct?: number;
  cotizaciones: CotizacionInput[];
}

export class OrdenNoPendienteDeCotizarError extends Error {
  constructor() {
    super("Esta orden no está pendiente de cotizar — solo se puede cotizar una vez autorizada (si es manual) y antes de generarle una compra.");
  }
}

export class YaTieneComparacionError extends Error {
  constructor() {
    super("Esta orden ya tiene una comparación de cotizaciones — ábrela para seguir agregando cotizaciones o generar la orden real.");
  }
}

const INCLUDE_COMPARACION = {
  producto: true,
  ordenCompra: { include: { producto: true, proveedor: true } },
  cotizaciones: { include: { proveedor: true, zona: true }, orderBy: { fechaCreacion: "asc" as const } },
};

export function listarComparaciones() {
  return prisma.comparacion.findMany({ include: INCLUDE_COMPARACION, orderBy: { fechaCreacion: "desc" } });
}

/** La Comparación de una OrdenCompra dada, si ya existe — para no duplicar al reabrir "Cotizar". */
export function obtenerComparacionDeOrden(ordenCompraId: string) {
  return prisma.comparacion.findUnique({ where: { ordenCompraId }, include: INCLUDE_COMPARACION });
}

export async function crearComparacion(input: CrearComparacionInput, creadoPorId: string) {
  const orden = await prisma.ordenCompra.findUniqueOrThrow({ where: { id: input.ordenCompraId }, include: { producto: true } });
  if (orden.estado !== "pendiente_cotizar") throw new OrdenNoPendienteDeCotizarError();

  const existente = await prisma.comparacion.findUnique({ where: { ordenCompraId: input.ordenCompraId } });
  if (existente) throw new YaTieneComparacionError();

  return prisma.comparacion.create({
    data: {
      ordenCompraId: input.ordenCompraId,
      productoId: orden.productoId,
      cantidadNecesaria: orden.cantidadSolicitada,
      unidad: orden.producto.unidad,
      umbralExcedentePct: input.umbralExcedentePct ?? 20,
      creadoPorId,
      cotizaciones: {
        create: input.cotizaciones.map((c) => ({
          proveedorId: c.proveedorId,
          zonaId: c.zonaId,
          nombreComercial: c.nombreComercial,
          moneda: c.moneda,
          precioValor: c.precioValor,
          tipoCambio: c.moneda === "USD" ? c.tipoCambio : undefined,
          presentacionCantidad: c.presentacionCantidad,
        })),
      },
    },
    include: INCLUDE_COMPARACION,
  });
}

/**
 * Captura asíncrona línea por línea (1.1, 2-sep-2026): agrega cotizaciones
 * a una Comparación ya existente, en cualquier momento posterior — el
 * historial de las que ya estaban se conserva intacto.
 */
export function agregarCotizaciones(comparacionId: string, cotizaciones: CotizacionInput[]) {
  return prisma.comparacionCotizacion.createMany({
    data: cotizaciones.map((c) => ({
      comparacionId,
      proveedorId: c.proveedorId,
      zonaId: c.zonaId,
      nombreComercial: c.nombreComercial,
      moneda: c.moneda,
      precioValor: c.precioValor,
      tipoCambio: c.moneda === "USD" ? c.tipoCambio : undefined,
      presentacionCantidad: c.presentacionCantidad,
    })),
  });
}

export class ComparacionConComprasError extends Error {
  constructor() {
    super("Ya se generaron órdenes reales desde esta comparación — no se puede borrar, perdería el historial de precios (1.2).");
  }
}

/**
 * Borra una Comparación completa — solo permitido si nunca se generó
 * ninguna orden real desde ella (1.2, 2-sep-2026: el historial de precios
 * por Proveedor es permanente en cuanto ya hay al menos una compra real).
 */
export async function eliminarComparacion(id: string) {
  const tieneOrdenesGeneradas = await prisma.ordenCompra.count({ where: { comparacionCotizacion: { comparacionId: id } } });
  if (tieneOrdenesGeneradas > 0) throw new ComparacionConComprasError();

  return prisma.$transaction(async (tx) => {
    await tx.comparacionCotizacion.deleteMany({ where: { comparacionId: id } });
    await tx.comparacion.delete({ where: { id } });
  });
}

export async function eliminarCotizacion(id: string) {
  const tieneOrdenesGeneradas = await prisma.ordenCompra.count({ where: { comparacionCotizacionId: id } });
  if (tieneOrdenesGeneradas > 0) throw new ComparacionConComprasError();
  return prisma.comparacionCotizacion.delete({ where: { id } });
}

export interface CotizacionCalculadaSalida {
  id: string;
  proveedor: { id: string; nombre: string };
  zona: { id: string; nombre: string; esZonaComprador: boolean };
  nombreComercial: string;
  moneda: MonedaCotizacion;
  precioValor: number;
  tipoCambio: number | null;
  precioValorMXN: number;
  presentacionCantidad: number;
  precioUnitarioMXN: number;
  unidadesAPedir: number;
  cantidadComprada: number;
  excedente: number;
  porcentajeExcedente: number;
  alertaExcedente: boolean;
  fleteTotal: number;
  precioTotalPresentaciones: number;
  totalConFlete: number;
  esMejorGlobal: boolean;
  esMejorLocal: boolean;
}

export interface OrdenGeneradaSalida {
  id: string;
  numero: number | null;
  estado: string;
  proveedorNombre: string;
  cantidadSolicitada: number;
  precioUnitario: number | null;
  fechaFormalizacion: Date | null;
}

export interface ComparacionCalculada {
  id: string;
  ordenCompraId: string | null;
  producto: { id: string; nombreComercial: string; unidad: string };
  cantidadNecesaria: number;
  unidad: string;
  umbralExcedentePct: number;
  fechaCreacion: Date;
  cotizaciones: CotizacionCalculadaSalida[];
  mejorGlobalId: string | null;
  mejorLocalId: string | null;
  ahorroForaneo: { monto: number; porcentaje: number } | null;
  // Compra parcial (1.4, 2-sep-2026): cuánto de cantidadNecesaria ya se
  // compró (órdenes reales generada/recibida) y cuánto falta.
  ordenesGeneradas: OrdenGeneradaSalida[];
  cantidadComprada: number;
  cantidadPendiente: number;
}

/**
 * Cálculo del Comparador (9.14, rediseño 29-ago-2026, 2-sep-2026): precio +
 * flete por Zona, dos recomendaciones lado a lado (mejor Global con flete
 * vs. mejor Local sin flete) — ver shared/compras/calculo.ts para la
 * fórmula exacta. Desde 2-sep-2026 también trae las órdenes reales ya
 * generadas desde esta Comparación, para la tarjeta de compra parcial.
 */
export async function obtenerComparacionCalculada(id: string): Promise<ComparacionCalculada | null> {
  const comparacion = await prisma.comparacion.findUnique({ where: { id }, include: INCLUDE_COMPARACION });
  if (!comparacion) return null;

  const cantidadNecesaria = Number(comparacion.cantidadNecesaria);
  const umbralExcedentePct = Number(comparacion.umbralExcedentePct);

  const calculadas = comparacion.cotizaciones.map((c) => {
    const calc = calcularCotizacion(cantidadNecesaria, {
      moneda: c.moneda,
      precioValor: Number(c.precioValor),
      tipoCambio: c.tipoCambio != null ? Number(c.tipoCambio) : null,
      presentacionCantidad: Number(c.presentacionCantidad),
      costoFleteKg: Number(c.zona.costoFleteKg),
    });
    return {
      id: c.id,
      proveedor: { id: c.proveedor.id, nombre: c.proveedor.nombre },
      zona: { id: c.zona.id, nombre: c.zona.nombre, esZonaComprador: c.zona.esZonaComprador },
      nombreComercial: c.nombreComercial,
      moneda: c.moneda,
      precioValor: Number(c.precioValor),
      tipoCambio: c.tipoCambio != null ? Number(c.tipoCambio) : null,
      presentacionCantidad: Number(c.presentacionCantidad),
      ...calc,
      alertaExcedente: calc.porcentajeExcedente > umbralExcedentePct,
      esMejorGlobal: false,
      esMejorLocal: false,
    };
  });

  let mejorGlobalId: string | null = null;
  let mejorLocalId: string | null = null;
  let ahorroForaneo: { monto: number; porcentaje: number } | null = null;
  if (calculadas.length > 0) {
    const mejorGlobal = calculadas.reduce((a, b) => (b.totalConFlete < a.totalConFlete ? b : a));
    mejorGlobal.esMejorGlobal = true;
    mejorGlobalId = mejorGlobal.id;

    const locales = calculadas.filter((c) => c.zona.esZonaComprador);
    let mejorLocalTotal: number | null = null;
    if (locales.length > 0) {
      const mejorLocal = locales.reduce((a, b) => (b.totalConFlete < a.totalConFlete ? b : a));
      mejorLocal.esMejorLocal = true;
      mejorLocalId = mejorLocal.id;
      mejorLocalTotal = mejorLocal.totalConFlete;
    }

    ahorroForaneo = calcularAhorroForaneo(mejorGlobal.totalConFlete, mejorLocalTotal);
  }

  const ordenesGeneradasRaw = await prisma.ordenCompra.findMany({
    where: { comparacionCotizacion: { comparacionId: id } },
    include: { proveedor: true },
    orderBy: { fechaFormalizacion: "asc" },
  });
  const ordenesGeneradas: OrdenGeneradaSalida[] = ordenesGeneradasRaw.map((o) => ({
    id: o.id,
    numero: o.numero,
    estado: o.estado,
    proveedorNombre: o.proveedor?.nombre ?? "—",
    cantidadSolicitada: Number(o.cantidadSolicitada),
    precioUnitario: o.precioUnitario != null ? Number(o.precioUnitario) : null,
    fechaFormalizacion: o.fechaFormalizacion,
  }));
  const cantidadComprada = ordenesGeneradasRaw
    .filter((o) => o.estado === "generada" || o.estado === "recibida")
    .reduce((s, o) => s + Number(o.cantidadSolicitada), 0);
  const cantidadPendiente = Math.max(0, cantidadNecesaria - cantidadComprada);

  return {
    id: comparacion.id,
    ordenCompraId: comparacion.ordenCompraId,
    producto: { id: comparacion.producto.id, nombreComercial: comparacion.producto.nombreComercial, unidad: comparacion.producto.unidad },
    cantidadNecesaria,
    unidad: comparacion.unidad,
    umbralExcedentePct,
    fechaCreacion: comparacion.fechaCreacion,
    cotizaciones: calculadas,
    mejorGlobalId,
    mejorLocalId,
    ahorroForaneo,
    ordenesGeneradas,
    cantidadComprada,
    cantidadPendiente,
  };
}

export class CantidadExcedePendienteError extends Error {
  constructor(pendiente: number) {
    super(`Esa cantidad excede lo que todavía falta comprar (${pendiente.toFixed(3)} pendiente) — ajusta la cantidad o cotiza el resto por separado.`);
  }
}

/**
 * "Generar orden de compra" (1.4, 2-sep-2026): convierte una línea de
 * cotización en una compra real — folio consecutivo, Proveedor y precio
 * fijos, lista para su Orden de Compra en PDF. Compra parcial: si
 * `cantidadDeseada` no cubre todo lo pendiente, la necesidad sigue abierta
 * (pendiente_cotizar) por el resto; cuando la suma de órdenes reales
 * generada/recibida alcanza cantidadNecesaria, la necesidad pasa a
 * "cubierta" — nunca se muta cantidadNecesaria ni la orden original, todo
 * se recalcula del historial completo (ver obtenerComparacionCalculada).
 */
export async function generarOrdenDesdeComparacion(
  comparacionId: string,
  cotizacionId: string,
  cantidadDeseada: number,
  generadoPorId: string
) {
  const comparacion = await prisma.comparacion.findUniqueOrThrow({
    where: { id: comparacionId },
    include: { ordenCompra: true },
  });
  if (!comparacion.ordenCompra) throw new Error("Esta comparación no está ligada a ninguna orden de compra.");

  const cotizacion = await prisma.comparacionCotizacion.findUniqueOrThrow({
    where: { id: cotizacionId },
    include: { zona: true },
  });
  if (cotizacion.comparacionId !== comparacionId) throw new Error("Esa cotización no pertenece a esta comparación.");

  const calculada = await obtenerComparacionCalculada(comparacionId);
  if (!calculada) throw new Error("Comparación no encontrada.");
  if (cantidadDeseada <= 0) throw new Error("La cantidad a comprar debe ser mayor a cero.");
  if (cantidadDeseada > calculada.cantidadPendiente + 0.0001) {
    throw new CantidadExcedePendienteError(calculada.cantidadPendiente);
  }

  const calc = calcularCotizacion(cantidadDeseada, {
    moneda: cotizacion.moneda,
    precioValor: Number(cotizacion.precioValor),
    tipoCambio: cotizacion.tipoCambio != null ? Number(cotizacion.tipoCambio) : null,
    presentacionCantidad: Number(cotizacion.presentacionCantidad),
    costoFleteKg: Number(cotizacion.zona.costoFleteKg),
  });

  const necesidad = comparacion.ordenCompra;

  return prisma.$transaction(async (tx) => {
    const numero = await siguienteFolio(tx, "orden_compra");
    const ordenReal = await tx.ordenCompra.create({
      data: {
        origen: necesidad.origen,
        productoId: necesidad.productoId,
        cantidadSolicitada: calc.cantidadComprada,
        estado: "generada",
        proveedorId: cotizacion.proveedorId,
        precioUnitario: calc.precioUnitarioMXN,
        referenciaAplicacionId: necesidad.referenciaAplicacionId,
        comparacionCotizacionId: cotizacion.id,
        creadoPorId: generadoPorId,
        fechaFormalizacion: new Date(),
        numero,
      },
    });

    const compradoTotal = calculada.cantidadComprada + calc.cantidadComprada;
    if (compradoTotal + 0.0001 >= calculada.cantidadNecesaria) {
      await tx.ordenCompra.update({ where: { id: necesidad.id }, data: { estado: "cubierta" } });
    }

    return ordenReal;
  });
}
