import { prisma } from "../../core/db.js";
import { intentarComprometer, registrarEntradaTx } from "../almacen/movimientos.js";

export class SolicitudYaResueltaOrdenError extends Error {
  constructor() {
    super("Esta orden ya fue resuelta — probablemente por otro autorizador casi al mismo tiempo.");
  }
}

export class ProductoNoAutorizadoError extends Error {
  constructor() {
    super("Este producto todavía no está autorizado — no se puede comprar hasta que Dirección General/Gerente Técnico lo autorice.");
  }
}

export class TransicionInvalidaError extends Error {
  constructor(esperado: string) {
    super(`Esta orden no está en estado "${esperado}".`);
  }
}

export function listarOrdenes(estado?: string) {
  return prisma.ordenCompra.findMany({
    where: { estado: estado as never },
    include: { producto: true, proveedor: true, recepciones: true },
    orderBy: { fechaCreacion: "desc" },
  });
}

/**
 * Solicitud manual (9.14) — nunca ligada a una Aplicación (eso son las
 * automáticas, que llegan cuando exista Aplicaciones/Fertilizantes).
 * Regla dura: si el producto es agroquímico/fertilizante, debe estar ya
 * autorizado antes de poder comprarse, no solo antes de aplicarse.
 */
export async function crearOrdenManual(productoId: string, cantidadSolicitada: number, creadoPorId: string) {
  const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
  if (!producto.autorizado) throw new ProductoNoAutorizadoError();

  return prisma.ordenCompra.create({
    data: {
      origen: "manual",
      productoId,
      cantidadSolicitada,
      estado: "pendiente_autorizar",
      creadoPorId,
    },
  });
}

/** "Primero en llegar gana" (bloque 4) — igual que el resto de autorizaciones del sistema. */
export async function autorizarOrden(id: string, autorizadoPorId: string) {
  const actualizadas = await prisma.ordenCompra.updateMany({
    where: { id, estado: "pendiente_autorizar" },
    data: { estado: "pendiente_cotizar", autorizadoPorId },
  });
  if (actualizadas.count === 0) throw new SolicitudYaResueltaOrdenError();
  return prisma.ordenCompra.findUniqueOrThrow({ where: { id } });
}

export async function rechazarOrden(id: string, autorizadoPorId: string, motivoRechazo?: string) {
  const actualizadas = await prisma.ordenCompra.updateMany({
    where: { id, estado: "pendiente_autorizar" },
    data: { estado: "rechazada", autorizadoPorId, motivoRechazo },
  });
  if (actualizadas.count === 0) throw new SolicitudYaResueltaOrdenError();
  return prisma.ordenCompra.findUniqueOrThrow({ where: { id } });
}

/** Se cotiza por fuera del sistema; aquí solo se formaliza (proveedor, precio, fecha esperada) — la orden queda "en camino". */
export async function cotizarOrden(id: string, proveedorId: string, precioUnitario: number, fechaEsperada?: string) {
  const orden = await prisma.ordenCompra.findUniqueOrThrow({ where: { id } });
  if (orden.estado !== "pendiente_cotizar") throw new TransicionInvalidaError("pendiente_cotizar");

  return prisma.ordenCompra.update({
    where: { id },
    data: {
      estado: "generada",
      proveedorId,
      precioUnitario,
      fechaEsperada: fechaEsperada ? new Date(fechaEsperada) : undefined,
      fechaFormalizacion: new Date(),
    },
  });
}

/** CxP (9.14): botón manual — no hay conciliación bancaria automática, Gerencia confirma que ya se pagó. */
export function marcarOrdenPagada(id: string) {
  return prisma.ordenCompra.update({ where: { id }, data: { pagada: true, fechaPago: new Date() } });
}

/**
 * Recepción flexible (9.14/9.15): lo recibido no siempre coincide con lo
 * pedido — se registra la cantidad real. Esto es lo que de verdad mueve el
 * inventario: llama al mismo mecanismo de entrada que usa Almacén
 * directamente, para que no haya dos formas distintas de "entrar" stock.
 */
export async function recibirOrden(
  id: string,
  cantidadRecibida: number,
  recibidoPorId: string,
  opciones: { lote?: string; fechaCaducidad?: string } = {}
) {
  const orden = await prisma.ordenCompra.findUniqueOrThrow({ where: { id } });
  if (orden.estado !== "generada") throw new TransicionInvalidaError("generada");

  return prisma.$transaction(async (tx) => {
    await tx.ordenCompra.update({ where: { id }, data: { estado: "recibida" } });
    await tx.ordenCompraRecepcion.create({
      data: {
        ordenId: id,
        cantidadRecibida,
        lote: opciones.lote,
        fechaCaducidad: opciones.fechaCaducidad ? new Date(opciones.fechaCaducidad) : undefined,
        recibidoPorId,
      },
    });
    // Misma transacción que el resto de la recepción — si algo falla
    // después, la entrada de inventario también se revierte.
    await registrarEntradaTx(tx, orden.productoId, cantidadRecibida, recibidoPorId, {
      lote: opciones.lote,
      fechaCaducidad: opciones.fechaCaducidad,
      referenciaId: id,
    });

    // Si esta orden nació automática porque una Aplicación/Fertilización en
    // espera no alcanzaba stock (9.5/9.7/9.14), al recibirla se intenta
    // apartar de inmediato la cantidad que necesita — misma transacción,
    // para que la entrada y el apartado queden atómicos. referenciaId puede
    // apuntar a cualquiera de los tres orígenes; se prueban en orden.
    if (orden.referenciaAplicacionId) {
      const refId = orden.referenciaAplicacionId;
      const aplicacion = await tx.aplicacion.findUnique({ where: { id: refId } });
      if (aplicacion) {
        await intentarComprometer(tx, orden.productoId, Number(aplicacion.cantidadTotalCalculada), refId, recibidoPorId);
      } else {
        const granular = await tx.fertilizacionGranular.findUnique({ where: { id: refId } });
        if (granular) {
          await intentarComprometer(tx, orden.productoId, Number(granular.cantidadTotalCalculada), refId, recibidoPorId);
        } else {
          const fertirriego = await tx.fertirriegoProgramacion.findUnique({ where: { id: refId } });
          if (fertirriego) {
            await intentarComprometer(tx, orden.productoId, Number(fertirriego.cantidadTotalCalculada), refId, recibidoPorId);
          }
        }
      }
    }
    return tx.ordenCompra.findUniqueOrThrow({ where: { id } });
  });
}
