import { calcularAhorroForaneo, calcularCotizacion, type MonedaCotizacion } from "@cbf/shared";
import { prisma } from "../../core/db.js";

export interface CotizacionInput {
  proveedorId: string;
  zonaId: string;
  nombreComercial: string;
  moneda: MonedaCotizacion;
  precioValor: number;
  tipoCambio?: number;
  presentacionCantidad: number;
}

export interface CrearComparacionInput {
  productoId: string;
  cantidadNecesaria: number;
  unidad: string;
  umbralExcedentePct?: number;
  cotizaciones: CotizacionInput[];
}

const INCLUDE_COMPARACION = { producto: true, cotizaciones: { include: { proveedor: true, zona: true } } };

export function listarComparaciones() {
  return prisma.comparacion.findMany({ include: INCLUDE_COMPARACION, orderBy: { fechaCreacion: "desc" } });
}

export function crearComparacion(input: CrearComparacionInput, creadoPorId: string) {
  return prisma.comparacion.create({
    data: {
      productoId: input.productoId,
      cantidadNecesaria: input.cantidadNecesaria,
      unidad: input.unidad,
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

/** Agrega cotizaciones a una comparación ya existente — misma Comparacion, no crea una nueva. */
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

export function eliminarComparacion(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.comparacionCotizacion.deleteMany({ where: { comparacionId: id } });
    await tx.comparacion.delete({ where: { id } });
  });
}

export function eliminarCotizacion(id: string) {
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

export interface ComparacionCalculada {
  id: string;
  producto: { id: string; nombreComercial: string; unidad: string };
  cantidadNecesaria: number;
  unidad: string;
  umbralExcedentePct: number;
  fechaCreacion: Date;
  cotizaciones: CotizacionCalculadaSalida[];
  mejorGlobalId: string | null;
  mejorLocalId: string | null;
  // Ahorro del foráneo (mejorGlobal) contra el local (mejorLocal) — null si
  // no hay cotización local capturada, o si el foráneo no compensa (en ese
  // caso mejorGlobal === mejorLocal, ver calcularAhorroForaneo).
  ahorroForaneo: { monto: number; porcentaje: number } | null;
}

/**
 * Cálculo del Comparador (9.14, rediseño 29-ago-2026): precio + flete por
 * Zona, dos recomendaciones lado a lado (mejor Global con flete vs. mejor
 * Local sin flete) — ver shared/compras/calculo.ts para la fórmula exacta
 * y la regla de "el foráneo solo compensa si su total con flete es menor
 * al total local".
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

  return {
    id: comparacion.id,
    producto: { id: comparacion.producto.id, nombreComercial: comparacion.producto.nombreComercial, unidad: comparacion.producto.unidad },
    cantidadNecesaria,
    unidad: comparacion.unidad,
    umbralExcedentePct,
    fechaCreacion: comparacion.fechaCreacion,
    cotizaciones: calculadas,
    mejorGlobalId,
    mejorLocalId,
    ahorroForaneo,
  };
}
