import { prisma } from "../../core/db.js";

export function listarProveedores() {
  return prisma.proveedor.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, include: { zona: true } });
}

export interface AltaProveedorInput {
  nombre: string;
  creditoMonto?: number;
  creditoVencimiento?: string;
  diasCredito?: number;
  datosFacturacion?: Record<string, unknown>;
  // Zona (Prioridad 2, 3-sep-2026) — de dónde envía normalmente, para
  // precargarla sola al cotizar con él en el Comparador (2.1/2.2).
  zonaId?: string;
}

export function crearProveedor(input: AltaProveedorInput) {
  return prisma.proveedor.create({
    data: {
      nombre: input.nombre,
      creditoMonto: input.creditoMonto,
      creditoVencimiento: input.creditoVencimiento ? new Date(input.creditoVencimiento) : undefined,
      diasCredito: input.diasCredito,
      datosFacturacion: input.datosFacturacion,
      zonaId: input.zonaId,
    },
    include: { zona: true },
  });
}

export function actualizarDiasCredito(id: string, diasCredito: number) {
  return prisma.proveedor.update({ where: { id }, data: { diasCredito } });
}

export function editarProveedor(id: string, input: AltaProveedorInput) {
  return prisma.proveedor.update({
    where: { id },
    data: {
      nombre: input.nombre,
      creditoMonto: input.creditoMonto,
      creditoVencimiento: input.creditoVencimiento ? new Date(input.creditoVencimiento) : undefined,
      diasCredito: input.diasCredito,
      datosFacturacion: input.datosFacturacion,
      zonaId: input.zonaId ?? null,
    },
    include: { zona: true },
  });
}

/**
 * El sistema no compara precios en tiempo real, pero sí muestra el
 * histórico de los mejores 3 proveedores anteriores por producto,
 * alimentado directo de órdenes ya formalizadas (9.14).
 */
export async function mejoresProveedoresPorProducto(productoId: string, limite = 3) {
  const ordenes = await prisma.ordenCompra.findMany({
    where: { productoId, precioUnitario: { not: null }, proveedorId: { not: null }, estado: { in: ["generada", "recibida"] } },
    include: { proveedor: true },
    orderBy: { precioUnitario: "asc" },
  });

  const vistos = new Set<string>();
  const mejores: typeof ordenes = [];
  for (const orden of ordenes) {
    if (!orden.proveedorId || vistos.has(orden.proveedorId)) continue;
    vistos.add(orden.proveedorId);
    mejores.push(orden);
    if (mejores.length >= limite) break;
  }
  return mejores.map((o) => ({
    proveedor: o.proveedor,
    precioUnitario: o.precioUnitario,
    fecha: o.fechaCreacion,
  }));
}

/**
 * Histórico de un Proveedor (4.4, V35, 17-sep-2026) -- información separada
 * de la vista activa de "Por Proveedor" (tarjetas de cotizaciones
 * pendientes), para consulta operativa ("¿a cuánto le compré esto la
 * última vez?"). Dos partes: compras reales ya formalizadas/recibidas, y
 * el historial completo de cotizaciones capturadas con él (se conservan
 * para siempre, aunque no hayan terminado en una compra).
 */
export async function historicoDeProveedor(proveedorId: string) {
  const [compras, cotizaciones] = await Promise.all([
    prisma.ordenCompra.findMany({
      where: { proveedorId, estado: { in: ["generada", "recibida"] } },
      include: { producto: true },
      orderBy: { fechaFormalizacion: "desc" },
    }),
    prisma.comparacionCotizacion.findMany({
      where: { proveedorId },
      include: { productoComercial: true, comparacion: { include: { producto: true } } },
      orderBy: { fechaCreacion: "desc" },
    }),
  ]);

  return {
    compras: compras.map((o) => ({
      id: o.id,
      numero: o.numero,
      nombreComercial: o.producto.nombreComercial,
      cantidadSolicitada: Number(o.cantidadSolicitada),
      unidad: o.producto.unidad,
      precioUnitario: o.precioUnitario != null ? Number(o.precioUnitario) : null,
      fecha: o.fechaFormalizacion,
      estado: o.estado,
    })),
    cotizaciones: cotizaciones.map((c) => ({
      id: c.id,
      nombreComercial: c.productoComercial.nombreComercial,
      ingredienteActivo: c.comparacion.producto.ingredienteActivo,
      moneda: c.moneda,
      precioValor: Number(c.precioValor),
      presentacionCantidad: Number(c.presentacionCantidad),
      contenedor: c.contenedor,
      fecha: c.fechaCreacion,
    })),
  };
}
