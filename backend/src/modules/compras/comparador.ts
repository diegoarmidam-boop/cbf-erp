import { prisma } from "../../core/db.js";

export interface CotizacionInput {
  proveedorId: string;
  precioPresentacion: number;
  cantidadPresentacion: number;
  unidadPresentacion: string;
}

export interface ItemComparacionInput {
  productoId: string;
  cantidadNecesaria: number;
  unidad: string;
  cotizaciones: CotizacionInput[];
}

export function listarComparaciones() {
  return prisma.comparacion.findMany({
    include: { items: { include: { producto: true } } },
    orderBy: { fechaCreacion: "desc" },
  });
}

export function crearComparacion(nombre: string | undefined, creadoPorId: string, items: ItemComparacionInput[]) {
  return prisma.comparacion.create({
    data: {
      nombre,
      creadoPorId,
      items: {
        create: items.map((it) => ({
          productoId: it.productoId,
          cantidadNecesaria: it.cantidadNecesaria,
          unidad: it.unidad,
          cotizaciones: { create: it.cotizaciones.map((c) => ({ ...c })) },
        })),
      },
    },
    include: { items: { include: { producto: true, cotizaciones: { include: { proveedor: true } } } } },
  });
}

export function eliminarComparacion(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.comparacionCotizacion.deleteMany({ where: { item: { comparacionId: id } } });
    await tx.comparacionItem.deleteMany({ where: { comparacionId: id } });
    await tx.comparacion.delete({ where: { id } });
  });
}

export interface CotizacionCalculada {
  id: string;
  proveedor: { id: string; nombre: string };
  precioPresentacion: number;
  cantidadPresentacion: number;
  unidadPresentacion: string;
  unidadesAPedir: number;
  cantidadComprada: number;
  precioFinal: number;
  porcentajeAprovechamiento: number;
  recomendado: boolean;
}

export interface ItemCalculado {
  id: string;
  producto: { id: string; nombreComercial: string };
  cantidadNecesaria: number;
  unidad: string;
  cotizaciones: CotizacionCalculada[];
  recomendacion: { proveedorId: string; proveedorNombre: string; ahorro: number } | null;
}

/**
 * Cálculo del Comparador (9.14): redondeo siempre hacia arriba a
 * presentaciones completas, precio final = precio total realmente pagado
 * por esas presentaciones completas (no proporcional), % de aprovechamiento
 * = necesario / comprado, y ahorro del recomendado contra el PROMEDIO de
 * todos los proveedores cotizados (no contra el más caro ni compras previas).
 */
export async function obtenerComparacionCalculada(id: string): Promise<{ id: string; nombre: string | null; fechaCreacion: Date; items: ItemCalculado[] } | null> {
  const comparacion = await prisma.comparacion.findUnique({
    where: { id },
    include: { items: { include: { producto: true, cotizaciones: { include: { proveedor: true } } } } },
  });
  if (!comparacion) return null;

  const items: ItemCalculado[] = comparacion.items.map((item) => {
    const cantidadNecesaria = Number(item.cantidadNecesaria);
    const calculadas = item.cotizaciones.map((c) => {
      const precioPresentacion = Number(c.precioPresentacion);
      const cantidadPresentacion = Number(c.cantidadPresentacion);
      const unidadesAPedir = Math.ceil(cantidadNecesaria / cantidadPresentacion);
      const cantidadComprada = unidadesAPedir * cantidadPresentacion;
      const precioFinal = unidadesAPedir * precioPresentacion;
      const porcentajeAprovechamiento = cantidadComprada > 0 ? (cantidadNecesaria / cantidadComprada) * 100 : 0;
      return {
        id: c.id,
        proveedor: { id: c.proveedor.id, nombre: c.proveedor.nombre },
        precioPresentacion,
        cantidadPresentacion,
        unidadPresentacion: c.unidadPresentacion,
        unidadesAPedir,
        cantidadComprada,
        precioFinal,
        porcentajeAprovechamiento,
        recomendado: false,
      };
    });

    let recomendacion: ItemCalculado["recomendacion"] = null;
    if (calculadas.length > 0) {
      const mejor = calculadas.reduce((a, b) => (b.precioFinal < a.precioFinal ? b : a));
      mejor.recomendado = true;
      const promedio = calculadas.reduce((s, c) => s + c.precioFinal, 0) / calculadas.length;
      recomendacion = { proveedorId: mejor.proveedor.id, proveedorNombre: mejor.proveedor.nombre, ahorro: promedio - mejor.precioFinal };
    }

    return {
      id: item.id,
      producto: { id: item.producto.id, nombreComercial: item.producto.nombreComercial },
      cantidadNecesaria,
      unidad: item.unidad,
      cotizaciones: calculadas,
      recomendacion,
    };
  });

  return { id: comparacion.id, nombre: comparacion.nombre, fechaCreacion: comparacion.fechaCreacion, items };
}
