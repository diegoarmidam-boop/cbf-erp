import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";

const SIN_LOTE = "ÚNICO"; // lote implícito para productos de Almacén General (requiereLote=false)

export async function stockTotalProducto(productoId: string): Promise<number> {
  const lotes = await prisma.productoLote.findMany({ where: { productoId } });
  return lotes.reduce((s, l) => s + Number(l.cantidadActual), 0);
}

/** Existencia de todos los productos en una sola consulta — evita N+1 en la tabla de Inventario. */
export async function stockTotalTodos(): Promise<Record<string, number>> {
  const lotes = await prisma.productoLote.findMany({ select: { productoId: true, cantidadActual: true } });
  const totales: Record<string, number> = {};
  for (const l of lotes) {
    totales[l.productoId] = (totales[l.productoId] ?? 0) + Number(l.cantidadActual);
  }
  return totales;
}

/**
 * Comprometido pendiente de entregar, por producto: cuando Compras recibe
 * una orden automática ligada a una Aplicación/Fertilización, el stock
 * entra y se compromete (descuenta FIFO) en la misma transacción — el
 * total "disponible" (stockTotalTodos) puede quedar en 0 aunque la entrega
 * sí ocurrió de verdad, porque ya está apartada para esa Aplicación
 * específica. Sin esta cifra aparte, en Inventario se ve como si la
 * recepción nunca hubiera pasado (confirmado 8-ago-2026, pruebas reales).
 * "Pendiente" = tiene salida_comprometida pero todavía no su salida_real
 * correspondiente (que se registra al confirmar la entrega a la Huerta).
 */
export async function stockComprometidoPendienteTodos(): Promise<Record<string, number>> {
  const comprometidos = await prisma.almacenCentralMovimiento.findMany({
    where: { tipo: "salida_comprometida" },
    select: { productoId: true, cantidad: true, referenciaId: true },
  });
  const referenciasEntregadas = new Set(
    (
      await prisma.almacenCentralMovimiento.findMany({
        where: { tipo: "salida_real", referenciaId: { not: null } },
        select: { referenciaId: true },
      })
    ).map((m) => m.referenciaId)
  );
  const totales: Record<string, number> = {};
  for (const m of comprometidos) {
    if (m.referenciaId && referenciasEntregadas.has(m.referenciaId)) continue;
    totales[m.productoId] = (totales[m.productoId] ?? 0) + Number(m.cantidad);
  }
  return totales;
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

export async function stockTotalProductoTx(tx: TransactionClient, productoId: string): Promise<number> {
  const lotes = await tx.productoLote.findMany({ where: { productoId } });
  return lotes.reduce((s, l) => s + Number(l.cantidadActual), 0);
}

/**
 * Reserva ("comprometido") de stock para una Aplicación/Fertilización en
 * espera (9.7/9.5) — descuenta FIFO desde ya, igual que una salida real,
 * pero se marca "salida_comprometida" porque el producto todavía no salió
 * físicamente hacia la Huerta (eso ocurre después, al confirmar la
 * entrega). Devuelve false sin tocar nada si el stock disponible no
 * alcanza todavía — quien llama decide qué hacer (ej. generar compra
 * automática por el faltante). Idempotente: si ya existe un compromiso
 * para esa referencia, no vuelve a descontar.
 */
export async function intentarComprometer(
  tx: TransactionClient,
  productoId: string,
  cantidadNecesaria: number,
  referenciaId: string,
  capturadoPorId: string
): Promise<boolean> {
  const yaComprometido = await tx.almacenCentralMovimiento.findFirst({
    where: { referenciaId, tipo: "salida_comprometida" },
  });
  if (yaComprometido) return true;

  const disponible = await stockTotalProductoTx(tx, productoId);
  if (disponible + 0.0001 < cantidadNecesaria) return false;

  await descontarFIFO(tx, productoId, cantidadNecesaria);
  await tx.almacenCentralMovimiento.create({
    data: { productoId, tipo: "salida_comprometida", cantidad: cantidadNecesaria, referenciaId, capturadoPorId },
  });
  return true;
}

/**
 * Libera un compromiso que nunca llegó a entregarse (vencimiento de 15
 * días sin salir de bodega, o cancelación manual — 9.7) — regresa la
 * cantidad al primer lote del producto; la precisión de a qué lote exacto
 * regresa no importa a nivel de negocio, solo el total agregado del stock.
 */
export async function liberarComprometido(
  tx: TransactionClient,
  productoId: string,
  cantidad: number,
  referenciaId: string,
  capturadoPorId: string,
  motivo: string
): Promise<void> {
  const lote = await tx.productoLote.findFirst({ where: { productoId } });
  if (!lote) throw new Error("No hay lote al que regresar el stock liberado.");
  await tx.productoLote.update({ where: { id: lote.id }, data: { cantidadActual: { increment: cantidad } } });
  await tx.almacenCentralMovimiento.create({
    data: { productoId, tipo: "ajuste_manual", cantidad, referenciaId, capturadoPorId, motivoAjuste: motivo },
  });
}

/**
 * Confirma la entrega física de un compromiso ya reservado (9.7/9.5): el
 * descuento FIFO ya ocurrió al comprometer, así que aquí solo se registra
 * el movimiento de auditoría "salida_real" y se suma al Almacén Local de
 * la Huerta — nunca se vuelve a descontar del Central.
 */
export async function confirmarEntregaComprometida(
  tx: TransactionClient,
  productoId: string,
  huertaId: string,
  cantidad: number,
  referenciaId: string,
  capturadoPorId: string
) {
  await tx.almacenCentralMovimiento.create({
    data: { productoId, tipo: "salida_real", cantidad, huertaDestinoId: huertaId, referenciaId, capturadoPorId },
  });
  const local = await tx.almacenLocal.upsert({
    where: { huertaId_productoId: { huertaId, productoId } },
    update: { cantidadRecibidaAcumulada: { increment: cantidad } },
    create: { huertaId, productoId, cantidadRecibidaAcumulada: cantidad },
  });
  await tx.almacenLocalMovimiento.create({
    data: { almacenLocalId: local.id, tipo: "entrega", cantidad, referenciaId, capturadoPorId },
  });
  return local;
}
