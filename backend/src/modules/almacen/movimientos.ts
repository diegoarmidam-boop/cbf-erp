import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";

const SIN_LOTE = "ÚNICO"; // lote implícito para productos de Almacén General (requiereLote=false)

export async function stockTotalProducto(productoId: string): Promise<number> {
  const lotes = await prisma.productoLote.findMany({ where: { productoId } });
  return lotes.reduce((s, l) => s + Number(l.cantidadActual), 0);
}

export function lotesDeProducto(productoId: string) {
  return prisma.productoLote.findMany({ where: { productoId }, orderBy: { fechaCaducidad: "asc" } });
}

interface OpcionesEntrada {
  lote?: string;
  fechaCaducidad?: string;
  referenciaId?: string;
}

/**
 * Núcleo de "entrada real de inventario", parametrizado por `tx` para que
 * otros módulos (Compras, al recibir una orden) puedan componerlo dentro de
 * su propia transacción en vez de abrir una segunda transacción anidada —
 * eso rompería la atomicidad (si la orden fallara después, la entrada ya
 * habría quedado aplicada). `registrarEntrada` de abajo es el atajo para
 * cuando Almacén lo usa solo, sin nadie más participando.
 */
export async function registrarEntradaTx(
  tx: TransactionClient,
  productoId: string,
  cantidad: number,
  capturadoPorId: string,
  opciones: OpcionesEntrada = {}
) {
  const producto = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });
  const claveLote = producto.requiereLote ? (opciones.lote ?? SIN_LOTE) : SIN_LOTE;

  let lote = producto.requiereLote
    ? await tx.productoLote.findFirst({ where: { productoId, lote: claveLote } })
    : await tx.productoLote.findFirst({ where: { productoId, lote: SIN_LOTE } });

  if (!lote) {
    lote = await tx.productoLote.create({
      data: {
        productoId,
        lote: claveLote,
        fechaCaducidad: opciones.fechaCaducidad ? new Date(opciones.fechaCaducidad) : undefined,
        cantidadActual: 0,
      },
    });
  }

  await tx.productoLote.update({ where: { id: lote.id }, data: { cantidadActual: { increment: cantidad } } });
  await tx.almacenCentralMovimiento.create({
    data: {
      productoId,
      loteId: lote.id,
      tipo: "entrada_compra",
      cantidad,
      referenciaId: opciones.referenciaId,
      capturadoPorId,
    },
  });
  return lote;
}

/** Entrada real de inventario (9.15) cuando nadie más necesita compartir la transacción. */
export async function registrarEntrada(productoId: string, cantidad: number, capturadoPorId: string, opciones: OpcionesEntrada = {}) {
  return prisma.$transaction((tx) => registrarEntradaTx(tx, productoId, cantidad, capturadoPorId, opciones));
}

/**
 * FIFO obligatorio por ingrediente activo (9.15): descuenta primero de los
 * lotes que caducan antes. Usado tanto para salida directa a Huerta como,
 * más adelante, para la salida real que dispare Aplicaciones/Fertilizantes.
 */
async function descontarFIFO(tx: TransactionClient, productoId: string, cantidad: number): Promise<void> {
  const lotes = await tx.productoLote.findMany({
    where: { productoId, cantidadActual: { gt: 0 } },
    orderBy: [{ fechaCaducidad: "asc" }],
  });
  let restante = cantidad;
  for (const lote of lotes) {
    if (restante <= 0) break;
    const disponible = Number(lote.cantidadActual);
    const tomar = Math.min(disponible, restante);
    await tx.productoLote.update({ where: { id: lote.id }, data: { cantidadActual: { decrement: tomar } } });
    restante -= tomar;
  }
  if (restante > 0.0001) {
    throw new StockInsuficienteError(productoId, cantidad, cantidad - restante);
  }
}

export class StockInsuficienteError extends Error {
  constructor(
    public productoId: string,
    public solicitado: number,
    public disponible: number
  ) {
    super(`Stock insuficiente: se pidieron ${solicitado} pero solo hay ${disponible} disponibles.`);
  }
}

/**
 * Salida directa del Central hacia una Huerta, ya entregada de una vez —
 * el mecanismo de "comprometido" (reservar al planear, entregar después)
 * lo maneja Aplicaciones/Fertilizantes cuando se construyan; hasta
 * entonces, esta es la única vía de salida hacia campo.
 */
export async function entregarAHuerta(productoId: string, huertaId: string, cantidad: number, capturadoPorId: string) {
  return prisma.$transaction(async (tx) => {
    await descontarFIFO(tx, productoId, cantidad);
    await tx.almacenCentralMovimiento.create({
      data: { productoId, tipo: "salida_real", cantidad, huertaDestinoId: huertaId, capturadoPorId },
    });

    const local = await tx.almacenLocal.upsert({
      where: { huertaId_productoId: { huertaId, productoId } },
      update: { cantidadRecibidaAcumulada: { increment: cantidad } },
      create: { huertaId, productoId, cantidadRecibidaAcumulada: cantidad },
    });
    await tx.almacenLocalMovimiento.create({
      data: { almacenLocalId: local.id, tipo: "entrega", cantidad, capturadoPorId },
    });
    return local;
  });
}

export type MotivoSalidaDirecta = "prestamo_rancho" | "merma" | "baja_caducidad" | "abono_sobrante" | "ajuste_manual";

/** Merma/baja/préstamo/ajuste — mermas y ajustes exigen motivo (doble-check de Gerencia, 9.15). */
export async function registrarSalidaDirecta(
  productoId: string,
  tipo: MotivoSalidaDirecta,
  cantidad: number,
  capturadoPorId: string,
  motivoAjuste?: string
) {
  if ((tipo === "merma" || tipo === "ajuste_manual") && !motivoAjuste) {
    throw new Error("Las mermas y ajustes requieren un motivo.");
  }
  return prisma.$transaction(async (tx) => {
    if (tipo === "abono_sobrante") {
      // Sobrante que regresa al almacén — es una entrada, no un descuento.
      const lote = await tx.productoLote.findFirst({ where: { productoId } });
      if (!lote) throw new Error("No hay lote al que abonar el sobrante.");
      await tx.productoLote.update({ where: { id: lote.id }, data: { cantidadActual: { increment: cantidad } } });
    } else {
      await descontarFIFO(tx, productoId, cantidad);
    }
    return tx.almacenCentralMovimiento.create({
      data: { productoId, tipo, cantidad, capturadoPorId, motivoAjuste },
    });
  });
}

/**
 * Diésel de garrafa consumido por un tractor — es inventario de Almacén,
 * igual que un agroquímico (9.13), así que una carga de combustible
 * también descuenta por FIFO en vez de vivir aparte sin tocar el stock.
 */
export async function registrarConsumoMaquinaria(productoId: string, cantidad: number, equipoId: string, capturadoPorId: string) {
  return prisma.$transaction(async (tx) => {
    await descontarFIFO(tx, productoId, cantidad);
    return tx.almacenCentralMovimiento.create({
      data: { productoId, tipo: "consumo_maquinaria", cantidad, referenciaId: equipoId, capturadoPorId },
    });
  });
}

export function movimientosProducto(productoId: string) {
  return prisma.almacenCentralMovimiento.findMany({ where: { productoId }, orderBy: { fecha: "desc" } });
}
