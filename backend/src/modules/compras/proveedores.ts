import { prisma } from "../../core/db.js";

export function listarProveedores() {
  return prisma.proveedor.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
}

export interface AltaProveedorInput {
  nombre: string;
  creditoMonto?: number;
  creditoVencimiento?: string;
  datosFacturacion?: Record<string, unknown>;
}

export function crearProveedor(input: AltaProveedorInput) {
  return prisma.proveedor.create({
    data: {
      nombre: input.nombre,
      creditoMonto: input.creditoMonto,
      creditoVencimiento: input.creditoVencimiento ? new Date(input.creditoVencimiento) : undefined,
      datosFacturacion: input.datosFacturacion,
    },
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
