import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
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

// Las "cancelada"/"rechazada" no se muestran por default — mismo criterio
// aplicado a Fertirriego/Granular/Aplicaciones (31-ago-2026): se ocultan
// de la lista activa pero no se borran (la trazabilidad de Almacén las
// sigue referenciando). Si se pide un `estado` específico (ej. el
// Comparador pidiendo `pendiente_cotizar`), ese filtro manda y
// `incluirCerradas` no aplica.
export function listarOrdenes(estado?: string, incluirCerradas?: boolean) {
  return prisma.ordenCompra.findMany({
    where: estado ? { estado: estado as never } : incluirCerradas ? {} : { estado: { notIn: ["cancelada", "rechazada"] } },
    include: { producto: true, proveedor: true, recepciones: true },
    orderBy: { fechaCreacion: "desc" },
  });
}

/**
 * Compras agrupadas por Ingrediente Activo (2.1, 2-sep-2026): suma la
 * cantidad pendiente de cada Ingrediente Activo a través de TODAS las
 * órdenes "necesidad" pendientes (pendiente_autorizar/pendiente_cotizar,
 * más lo que le falte a una "generada"/"cubierta" parcialmente cotizada),
 * sin importar su origen — para comprar en volumen. No reemplaza la vista
 * por orden individual, coexisten (una es para urgencia puntual, la otra
 * para anticipar en volumen).
 */
export async function listarPendientesPorIngredienteActivo() {
  const ordenes = await prisma.ordenCompra.findMany({
    where: { estado: { in: ["pendiente_autorizar", "pendiente_cotizar", "generada", "cubierta"] } },
    include: {
      producto: true,
      comparacionOrigen: { include: { cotizaciones: true } },
    },
  });

  const grupos = new Map<
    string,
    { ingredienteActivo: string; unidad: string; cantidadPendiente: number; ordenes: { id: string; estado: string; cantidadPendiente: number }[] }
  >();

  for (const orden of ordenes) {
    // "Necesidad" ya cotizada parcialmente (tiene Comparación ligada):
    // pendiente = cantidadNecesaria - ya comprado. Sin Comparación: toda
    // cantidadSolicitada sigue pendiente.
    let cantidadPendiente = Number(orden.cantidadSolicitada);
    if (orden.comparacionOrigen) {
      const ordenesReales = await prisma.ordenCompra.findMany({
        where: { comparacionCotizacion: { comparacionId: orden.comparacionOrigen.id }, estado: { in: ["generada", "recibida"] } },
      });
      const comprado = ordenesReales.reduce((s, o) => s + Number(o.cantidadSolicitada), 0);
      cantidadPendiente = Math.max(0, Number(orden.cantidadSolicitada) - comprado);
    }
    if (cantidadPendiente <= 0) continue;

    const clave = orden.producto.ingredienteActivo ?? `producto:${orden.producto.id}`;
    const etiqueta = orden.producto.ingredienteActivo ?? orden.producto.nombreComercial;
    const existente = grupos.get(clave);
    if (existente) {
      existente.cantidadPendiente += cantidadPendiente;
      existente.ordenes.push({ id: orden.id, estado: orden.estado, cantidadPendiente });
    } else {
      grupos.set(clave, {
        ingredienteActivo: etiqueta,
        unidad: orden.producto.unidad,
        cantidadPendiente,
        ordenes: [{ id: orden.id, estado: orden.estado, cantidadPendiente }],
      });
    }
  }

  return [...grupos.values()].sort((a, b) => a.ingredienteActivo.localeCompare(b.ingredienteActivo, "es"));
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

/**
 * Cancela toda orden de compra ligada a una programación que se acaba de
 * cancelar/liberar (1.5, 2-sep-2026) — sin importar si ya se cotizó o ya
 * se formalizó/generó con un Proveedor (`generada`), mientras el producto
 * todavía no haya llegado a Almacén (`recibida` nunca se toca). Cubre
 * tanto la orden "necesidad" original como cualquier orden real generada
 * parcialmente desde el Comparador (ambas comparten `referenciaAplicacionId`).
 * Debe llamarse DENTRO de la misma transacción que cancela la programación.
 */
export async function cancelarOrdenesDeReferencia(tx: TransactionClient, referenciaAplicacionId: string) {
  await tx.ordenCompra.updateMany({
    where: { referenciaAplicacionId, estado: { in: ["pendiente_autorizar", "pendiente_cotizar", "generada", "cubierta"] } },
    data: { estado: "cancelada" },
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
 *
 * Confirmar producto recibido (2.3, 2-sep-2026): `productoRecibidoId` es
 * el producto que de verdad llegó — el pedido, el preferido, o un
 * sustituto autorizado (ver almacen/preferencias.ts). La entrada de
 * inventario SIEMPRE se registra bajo el producto que de verdad llegó
 * (físicamente correcto). Si es distinto del producto pedido y esta orden
 * viene de una programación en espera (Aplicación/Granular/Fertirriego):
 * por decisión de Diego (2-sep-2026) un sustituto autorizado SÍ cumple la
 * programación de origen con la misma cantidad ya calculada — para que
 * eso funcione de verdad en todo el sistema (alertas de "comprometido",
 * Riego, notificaciones, etc., todas siguen el productoId de la fila de
 * la programación), se actualiza esa fila para que apunte al sustituto
 * ANTES de comprometer stock — no se compromete el producto viejo con
 * stock del sustituto (eso sí dejaría el historial de Almacén
 * inconsistente: un movimiento de salida de un producto que en realidad
 * nunca se movió).
 */
export async function recibirOrden(
  id: string,
  cantidadRecibida: number,
  recibidoPorId: string,
  opciones: { lote?: string; fechaCaducidad?: string; productoRecibidoId?: string } = {}
) {
  const orden = await prisma.ordenCompra.findUniqueOrThrow({ where: { id } });
  if (orden.estado !== "generada") throw new TransicionInvalidaError("generada");
  const productoRecibidoId = opciones.productoRecibidoId ?? orden.productoId;

  return prisma.$transaction(async (tx) => {
    await tx.ordenCompra.update({ where: { id }, data: { estado: "recibida" } });
    await tx.ordenCompraRecepcion.create({
      data: {
        ordenId: id,
        cantidadRecibida,
        lote: opciones.lote,
        fechaCaducidad: opciones.fechaCaducidad ? new Date(opciones.fechaCaducidad) : undefined,
        recibidoPorId,
        productoRecibidoId,
      },
    });
    // Misma transacción que el resto de la recepción — si algo falla
    // después, la entrada de inventario también se revierte. Siempre bajo
    // el producto que de verdad llegó, sea el pedido o un sustituto.
    await registrarEntradaTx(tx, productoRecibidoId, cantidadRecibida, recibidoPorId, {
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
      // Varios productos por programación (10-ago-2026): la cantidad a
      // comprometer es la de ESTE producto específico dentro de la
      // Aplicación/Fertilización/Fertirriego, no la de toda la programación.
      //
      // Busca por `orden.productoId` O `productoRecibidoId` (2-sep-2026):
      // una necesidad se puede cubrir con VARIAS órdenes parciales — si la
      // primera ya confirmó un sustituto, la fila de la programación
      // queda apuntando a ese sustituto, y una segunda orden parcial
      // (cuyo `orden.productoId` todavía dice el producto pedido
      // original) ya no la encontraría buscando solo por ese id.
      const productoIds = productoRecibidoId === orden.productoId ? [orden.productoId] : [orden.productoId, productoRecibidoId];
      const aplicacionProducto = await tx.aplicacionProducto.findFirst({ where: { aplicacionId: refId, productoId: { in: productoIds } } });
      if (aplicacionProducto) {
        if (aplicacionProducto.productoId !== productoRecibidoId) {
          await tx.aplicacionProducto.update({ where: { id: aplicacionProducto.id }, data: { productoId: productoRecibidoId } });
        }
        await intentarComprometer(tx, productoRecibidoId, Number(aplicacionProducto.cantidadTotalCalculada), refId, recibidoPorId);
      } else {
        const granularProducto = await tx.fertilizacionGranularProducto.findFirst({ where: { fertilizacionId: refId, productoId: { in: productoIds } } });
        if (granularProducto) {
          if (granularProducto.productoId !== productoRecibidoId) {
            await tx.fertilizacionGranularProducto.update({ where: { id: granularProducto.id }, data: { productoId: productoRecibidoId } });
          }
          await intentarComprometer(tx, productoRecibidoId, Number(granularProducto.cantidadTotalCalculada), refId, recibidoPorId);
        } else {
          const fertirriegoProducto = await tx.fertirriegoProgramacionProducto.findFirst({ where: { fertirriegoId: refId, productoId: { in: productoIds } } });
          if (fertirriegoProducto) {
            if (fertirriegoProducto.productoId !== productoRecibidoId) {
              await tx.fertirriegoProgramacionProducto.update({ where: { id: fertirriegoProducto.id }, data: { productoId: productoRecibidoId } });
            }
            await intentarComprometer(tx, productoRecibidoId, Number(fertirriegoProducto.cantidadTotalCalculada), refId, recibidoPorId);
          }
        }
      }
    }
    return tx.ordenCompra.findUniqueOrThrow({ where: { id } });
  });
}
