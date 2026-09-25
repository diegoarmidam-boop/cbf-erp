import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
import { siguienteFolio } from "../../core/contador.js";
import type { TipoMovimientoAlmacenCentral } from "@prisma/client";

const SIN_LOTE = "ÚNICO"; // lote implícito para productos de Almacén General (requiereLote=false)
const CONTADOR_LOTE_ALMACEN = "lote_almacen";

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
  // Bug real (V1 P3, 21-sep-2026): esto sumaba TODO `salida_comprometida`
  // sin restar lo que después se liberó (editar la programación quitando/
  // bajando un producto, o liberar/cancelar) -- `liberarComprometido`
  // regresa el stock al lote y deja un `ajuste_manual` con la misma
  // referencia, pero el compromiso original seguía contando, así que la
  // etiqueta "comprometido" nunca bajaba aunque la existencia sí. Se
  // netea por (referencia, producto): comprometido - liberado, mínimo 0.
  // (`ajuste_manual` con referenciaId solo lo crea liberarComprometido;
  // la salida manual de Movimientos no lleva referencia.)
  const liberaciones = await prisma.almacenCentralMovimiento.findMany({
    where: { tipo: "ajuste_manual", referenciaId: { not: null } },
    select: { productoId: true, cantidad: true, referenciaId: true },
  });
  const liberadoPorClave = new Map<string, number>();
  for (const l of liberaciones) {
    const clave = `${l.referenciaId}|${l.productoId}`;
    liberadoPorClave.set(clave, (liberadoPorClave.get(clave) ?? 0) + Number(l.cantidad));
  }
  const comprometidoPorClave = new Map<string, { productoId: string; cantidad: number }>();
  for (const m of comprometidos) {
    if (m.referenciaId && referenciasEntregadas.has(m.referenciaId)) continue;
    const clave = `${m.referenciaId}|${m.productoId}`;
    const previo = comprometidoPorClave.get(clave);
    comprometidoPorClave.set(clave, { productoId: m.productoId, cantidad: (previo?.cantidad ?? 0) + Number(m.cantidad) });
  }
  const totales: Record<string, number> = {};
  for (const [clave, { productoId, cantidad }] of comprometidoPorClave) {
    const vigente = cantidad - (liberadoPorClave.get(clave) ?? 0);
    if (vigente > 0.0001) totales[productoId] = (totales[productoId] ?? 0) + vigente;
  }
  return totales;
}

export function lotesDeProducto(productoId: string) {
  return prisma.productoLote.findMany({ where: { productoId }, orderBy: { fechaLlegada: "asc" } });
}

export class PrecioEntradaRequeridoError extends Error {
  constructor() {
    super("El precio unitario es obligatorio en toda Entrada — sin él no se puede costear lo que después consuma ese lote.");
  }
}

interface OpcionesEntrada {
  // Obligatorio (P1, V1 20-sep-2026): precio unitario en MXN.
  precioUnitario: number;
  // Solo en Entrada manual sin Orden de Compra ligada (la ruta lo exige).
  motivoEntradaManual?: string;
  lote?: string;
  fechaCaducidad?: string;
  referenciaId?: string;
  // Presentación de esta entrada (Prioridad 2, 4-sep-2026) — se guarda en
  // el lote para el desglose de Inventario. Null en entradas que no vienen
  // de una recepción real (ej. abono de sobrante).
  contenedor?: string;
  presentacionCantidad?: number;
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
  opciones: OpcionesEntrada
) {
  if (!Number.isFinite(opciones.precioUnitario) || opciones.precioUnitario <= 0) throw new PrecioEntradaRequeridoError();
  const producto = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });
  const claveLote = producto.requiereLote ? (opciones.lote ?? SIN_LOTE) : SIN_LOTE;

  // Un lote = una recepción (V1 P1, 25-sep-2026, regla b): cada llamada
  // crea SIEMPRE una fila nueva de ProductoLote con su propio Número de
  // Lote de Almacén consecutivo — ya no se reutiliza una fila existente
  // aunque coincidan producto/presentación/texto de lote (antes fusionaba
  // recepciones distintas en un mismo lote, perdiendo su identidad y su
  // costo propio). Si en una misma recepción llegan varias tarimas del
  // mismo producto, es responsabilidad del caller pedir UNA sola entrada
  // por esa línea (ya es como recibirOrden/registrarEntrada capturan hoy).
  const numeroLote = await siguienteFolio(tx, CONTADOR_LOTE_ALMACEN);
  const lote = await tx.productoLote.create({
    data: {
      productoId,
      numeroLote,
      lote: claveLote,
      fechaCaducidad: opciones.fechaCaducidad ? new Date(opciones.fechaCaducidad) : undefined,
      cantidadActual: cantidad,
      contenedor: opciones.contenedor,
      presentacionCantidad: opciones.presentacionCantidad,
    },
  });

  await tx.almacenCentralMovimiento.create({
    data: {
      productoId,
      loteId: lote.id,
      tipo: "entrada_compra",
      cantidad,
      referenciaId: opciones.referenciaId,
      precioUnitario: opciones.precioUnitario,
      motivoAjuste: opciones.motivoEntradaManual,
      capturadoPorId,
    },
  });
  return lote;
}

/** Entrada real de inventario (9.15) cuando nadie más necesita compartir la transacción. */
export async function registrarEntrada(productoId: string, cantidad: number, capturadoPorId: string, opciones: OpcionesEntrada) {
  return prisma.$transaction((tx) => registrarEntradaTx(tx, productoId, cantidad, capturadoPorId, opciones));
}

export interface PorcionLote {
  loteId: string;
  cantidad: number;
}

/**
 * Crea un lote "de respaldo" (V1 P1, 25-sep-2026) para los casos raros
 * donde hay que regresar/abonar cantidad pero el lote de origen real ya no
 * existe — con su propio Número de Lote de Almacén, igual que cualquier
 * otro lote (nunca queda sin numerar).
 */
export async function crearLoteRespaldo(tx: TransactionClient, productoId: string, cantidad: number, etiqueta: string) {
  const numeroLote = await siguienteFolio(tx, CONTADOR_LOTE_ALMACEN);
  return tx.productoLote.create({ data: { productoId, numeroLote, lote: etiqueta, cantidadActual: cantidad } });
}

/**
 * FIFO (V1 P1, 25-sep-2026, regla d: por fecha de llegada, ya no por
 * caducidad) — descuenta primero del lote más antiguo por `fechaLlegada`
 * dentro del mismo producto (ya resuelto a preferido/sustituto antes de
 * llegar aquí, ver comentario de `aplicarSustitutoAntesDeComprometer` en
 * aplicaciones.ts). Si un solo lote no alcanza, divide entre los
 * siguientes — cada parte se regresa en el desglose para que el caller
 * registre un movimiento por lote, cada uno a su propio precio (regla f).
 */
async function descontarFIFO(tx: TransactionClient, productoId: string, cantidad: number): Promise<PorcionLote[]> {
  const lotes = await tx.productoLote.findMany({
    where: { productoId, cantidadActual: { gt: 0 } },
    orderBy: [{ fechaLlegada: "asc" }],
  });
  let restante = cantidad;
  const porciones: PorcionLote[] = [];
  for (const lote of lotes) {
    if (restante <= 0) break;
    const disponible = Number(lote.cantidadActual);
    const tomar = Math.min(disponible, restante);
    await tx.productoLote.update({ where: { id: lote.id }, data: { cantidadActual: { decrement: tomar } } });
    porciones.push({ loteId: lote.id, cantidad: tomar });
    restante -= tomar;
  }
  if (restante > 0.0001) {
    throw new StockInsuficienteError(productoId, cantidad, cantidad - restante);
  }
  return porciones;
}

/**
 * Desglose por lote de lo que un conjunto de movimientos (ej. todo lo
 * `salida_comprometida` de una Aplicación+producto) realmente tomó — base
 * para devolver/confirmar al lote EXACTO de origen (regla f: una
 * devolución regresa al mismo lote y al mismo precio con el que salió).
 * Ignora movimientos históricos sin loteId (anteriores a este cambio).
 */
export async function desgloseLotesDeMovimientos(
  tx: TransactionClient,
  referenciaId: string,
  productoId: string,
  tipos: TipoMovimientoAlmacenCentral[]
): Promise<PorcionLote[]> {
  const movimientos = await tx.almacenCentralMovimiento.findMany({
    where: { referenciaId, productoId, tipo: { in: tipos }, loteId: { not: null } },
    select: { loteId: true, cantidad: true },
  });
  const porLote = new Map<string, number>();
  for (const m of movimientos) {
    porLote.set(m.loteId!, (porLote.get(m.loteId!) ?? 0) + Number(m.cantidad));
  }
  return [...porLote.entries()].map(([loteId, cantidad]) => ({ loteId, cantidad }));
}

/**
 * Reparte `cantidadARegresar` proporcionalmente entre el desglose de lotes
 * de origen e incrementa cada `ProductoLote.cantidadActual` — usado para
 * devoluciones parciales (regla f) cuando el origen abarcó más de un lote.
 * Si `cantidadARegresar` cubre el desglose completo, cada lote recibe
 * exactamente lo que había dado. Devuelve el desglose realmente aplicado
 * (para que el caller registre un movimiento por lote).
 */
export async function regresarProporcionalALotes(
  tx: TransactionClient,
  desglose: PorcionLote[],
  cantidadARegresar: number
): Promise<PorcionLote[]> {
  const totalOrigen = desglose.reduce((s, p) => s + p.cantidad, 0);
  if (totalOrigen <= 0) return [];
  const aplicado: PorcionLote[] = [];
  let restante = cantidadARegresar;
  for (let i = 0; i < desglose.length; i++) {
    const porcion = desglose[i]!;
    // Último renglón se lleva el residuo (evita perder centésimas por
    // redondeo de la proporción en los anteriores) — igual que el reparto
    // por Cuadro de otras prioridades.
    const esUltimo = i === desglose.length - 1;
    const parte = esUltimo ? restante : (porcion.cantidad / totalOrigen) * cantidadARegresar;
    if (parte <= 0.0001) continue;
    await tx.productoLote.update({ where: { id: porcion.loteId }, data: { cantidadActual: { increment: parte } } });
    aplicado.push({ loteId: porcion.loteId, cantidad: parte });
    restante -= parte;
  }
  return aplicado;
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
 * lo maneja Aplicaciones/Fertilizantes/Granular/Vivero. `opciones.loteId`
 * (V1 P1, 25-sep-2026, regla e): si el almacenista elige a mano un lote
 * distinto al que el FIFO por fecha de llegada habría sugerido, se
 * descuenta SOLO de ese lote (sin repartir) y el movimiento queda marcado
 * "fuera de orden" con su motivo.
 */
export async function entregarAHuerta(
  productoId: string,
  huertaId: string,
  cantidad: number,
  capturadoPorId: string,
  opciones?: OverrideLoteEntrega
) {
  return prisma.$transaction(async (tx) => {
    if (opciones) {
      const lote = await tx.productoLote.findUniqueOrThrow({ where: { id: opciones.loteIdElegido } });
      if (Number(lote.cantidadActual) + 0.0001 < cantidad) {
        throw new StockInsuficienteError(productoId, cantidad, Number(lote.cantidadActual));
      }
      await tx.productoLote.update({ where: { id: opciones.loteIdElegido }, data: { cantidadActual: { decrement: cantidad } } });
      await tx.almacenCentralMovimiento.create({
        data: {
          productoId,
          loteId: opciones.loteIdElegido,
          tipo: "salida_real",
          cantidad,
          huertaDestinoId: huertaId,
          capturadoPorId,
          fueraDeOrden: true,
          motivoFueraDeOrden: opciones.motivo,
        },
      });
    } else {
      const porciones = await descontarFIFO(tx, productoId, cantidad);
      for (const p of porciones) {
        await tx.almacenCentralMovimiento.create({
          data: { productoId, loteId: p.loteId, tipo: "salida_real", cantidad: p.cantidad, huertaDestinoId: huertaId, capturadoPorId },
        });
      }
    }

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
      return tx.almacenCentralMovimiento.create({
        data: { productoId, loteId: lote.id, tipo, cantidad, capturadoPorId, motivoAjuste },
      });
    }
    const porciones = await descontarFIFO(tx, productoId, cantidad);
    const movimientos = [];
    for (const p of porciones) {
      movimientos.push(
        await tx.almacenCentralMovimiento.create({
          data: { productoId, loteId: p.loteId, tipo, cantidad: p.cantidad, capturadoPorId, motivoAjuste },
        })
      );
    }
    return movimientos[0]!;
  });
}

/**
 * Diésel de garrafa consumido por un tractor — es inventario de Almacén,
 * igual que un agroquímico (9.13), así que una carga de combustible
 * también descuenta por FIFO en vez de vivir aparte sin tocar el stock.
 */
export async function registrarConsumoMaquinaria(productoId: string, cantidad: number, equipoId: string, capturadoPorId: string) {
  return prisma.$transaction(async (tx) => {
    const porciones = await descontarFIFO(tx, productoId, cantidad);
    const movimientos = [];
    for (const p of porciones) {
      movimientos.push(
        await tx.almacenCentralMovimiento.create({
          data: { productoId, loteId: p.loteId, tipo: "consumo_maquinaria", cantidad: p.cantidad, referenciaId: equipoId, capturadoPorId },
        })
      );
    }
    return movimientos[0]!;
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
  // El filtro por productoId es necesario (10-ago-2026, varios productos
  // por Aplicación/Fertilización comparten el mismo referenciaId) — sin
  // él, comprometer el segundo producto de una misma programación
  // detectaba el compromiso del PRIMER producto y se daba por hecho sin
  // revisar su propio stock ni generar su propia orden de compra si faltaba.
  const yaComprometido = await tx.almacenCentralMovimiento.findFirst({
    where: { referenciaId, productoId, tipo: "salida_comprometida" },
  });
  if (yaComprometido) return true;

  const disponible = await stockTotalProductoTx(tx, productoId);
  if (disponible + 0.0001 < cantidadNecesaria) return false;

  const porciones = await descontarFIFO(tx, productoId, cantidadNecesaria);
  for (const p of porciones) {
    await tx.almacenCentralMovimiento.create({
      data: { productoId, loteId: p.loteId, tipo: "salida_comprometida", cantidad: p.cantidad, referenciaId, capturadoPorId },
    });
  }
  return true;
}

/**
 * Aparta una cantidad ADICIONAL sobre un compromiso que ya existía (9.7/9.5,
 * 15-ago-2026: edición de dosis después de programar/entregar) — a
 * diferencia de `intentarComprometer`, no es idempotente por diseño: cada
 * llamada aparta más, porque la dosis subió de verdad. Devuelve false sin
 * tocar nada si no alcanza (quien llama decide, ej. generar compra automática).
 */
export async function comprometerAdicional(
  tx: TransactionClient,
  productoId: string,
  cantidadAdicional: number,
  referenciaId: string,
  capturadoPorId: string
): Promise<boolean> {
  const disponible = await stockTotalProductoTx(tx, productoId);
  if (disponible + 0.0001 < cantidadAdicional) return false;

  const porciones = await descontarFIFO(tx, productoId, cantidadAdicional);
  for (const p of porciones) {
    await tx.almacenCentralMovimiento.create({
      data: { productoId, loteId: p.loteId, tipo: "salida_comprometida", cantidad: p.cantidad, referenciaId, capturadoPorId },
    });
  }
  return true;
}

/**
 * Libera un compromiso que nunca llegó a entregarse (vencimiento de 15
 * días sin salir de bodega, o cancelación manual — 9.7) — regresa la
 * cantidad al primer lote del producto; la precisión de a qué lote exacto
 * regresa no importa a nivel de negocio, solo el total agregado del stock.
 * Si no existe ningún lote (bug real, 3-sep-2026: encontrado en una
 * programación de Fertirriego atorada en producción — el compromiso
 * original SÍ existía en el historial de movimientos, pero su lote ya no
 * — probablemente por una limpieza de datos de prueba fuera de la app),
 * se crea uno nuevo igual que hace `registrarEntradaTx` con una entrada
 * normal, en vez de tronar la operación: quien llama aquí ya confirmó que
 * de verdad hubo un compromiso que hay que devolver.
 */
export async function liberarComprometido(
  tx: TransactionClient,
  productoId: string,
  cantidad: number,
  referenciaId: string,
  capturadoPorId: string,
  motivo: string
): Promise<void> {
  // Regresa al/los lote(s) EXACTOS de donde salió (V1 P1, 25-sep-2026,
  // regla f) — antes regresaba "al primer lote del producto" sin importar
  // cuál había dado el stock; ahora, como cada lote tiene su propio
  // precio, hacerlo mal desvaloriza el lote equivocado.
  const desglose = await desgloseLotesDeMovimientos(tx, referenciaId, productoId, ["salida_comprometida"]);
  const aplicado = await regresarProporcionalALotes(tx, desglose, cantidad);

  if (aplicado.length === 0) {
    // Caso raro (bug real, 3-sep-2026): el compromiso existía en el
    // historial pero su(s) lote(s) ya no — se crea uno nuevo en vez de
    // tronar la operación (ver comentario original de este caso).
    const lote = await crearLoteRespaldo(tx, productoId, cantidad, SIN_LOTE);
    await tx.almacenCentralMovimiento.create({
      data: { productoId, loteId: lote.id, tipo: "ajuste_manual", cantidad, referenciaId, capturadoPorId, motivoAjuste: motivo },
    });
    return;
  }
  for (const p of aplicado) {
    await tx.almacenCentralMovimiento.create({
      data: { productoId, loteId: p.loteId, tipo: "ajuste_manual", cantidad: p.cantidad, referenciaId, capturadoPorId, motivoAjuste: motivo },
    });
  }
}

/**
 * Reduce (o cancela si llega a $0) las compras automáticas todavía
 * pendientes de una Aplicación/Fertilización para un producto — usado
 * cuando baja la cantidad necesaria pero esa cantidad nunca llegó a
 * comprometerse de verdad (intentarComprometer/comprometerAdicional
 * fallaron por falta de stock en su momento y generaron esta compra en su
 * lugar), así que no hay nada que liberar de Almacén, solo que ya no hace
 * falta comprar tanto.
 */
async function reducirCompraPendiente(tx: TransactionClient, referenciaId: string, productoId: string, cantidadAReducir: number): Promise<void> {
  const pendientes = await tx.ordenCompra.findMany({
    where: { referenciaAplicacionId: referenciaId, productoId, estado: { in: ["pendiente_autorizar", "pendiente_cotizar"] } },
    orderBy: { fechaCreacion: "desc" },
  });
  let restante = cantidadAReducir;
  for (const orden of pendientes) {
    if (restante <= 0.0001) break;
    const solicitada = Number(orden.cantidadSolicitada);
    if (solicitada <= restante + 0.0001) {
      await tx.ordenCompra.update({ where: { id: orden.id }, data: { estado: "cancelada" } });
      restante -= solicitada;
    } else {
      await tx.ordenCompra.update({ where: { id: orden.id }, data: { cantidadSolicitada: solicitada - restante } });
      restante = 0;
    }
  }
}

/**
 * Ajusta lo apartado/entregado de un producto de `cantidadAnterior` a
 * `cantidadNueva` (9.7/9.5, 15-ago-2026: edición de dosis después de
 * programar/entregar, compartido entre Aplicaciones y Fertilización
 * Granular — misma mecánica en ambas). Sube: aparta la diferencia si
 * alcanza, si no genera compra automática; si ya estaba entregada, la
 * diferencia apartada se entrega de inmediato también. Baja: si no se
 * había entregado, libera el compromiso; si ya se entregó, regresa el
 * sobrante del Almacén Local al Central como abono, marcado sin confirmar
 * hasta que Bodega registre que ya le llegó físicamente de vuelta.
 */
export async function ajustarCantidadProducto(
  tx: TransactionClient,
  huertaId: string,
  referenciaId: string,
  productoId: string,
  cantidadAnterior: number,
  cantidadNueva: number,
  entregada: boolean,
  editadoPorId: string
): Promise<void> {
  const delta = cantidadNueva - cantidadAnterior;
  if (Math.abs(delta) < 0.0001) return;

  if (delta > 0) {
    const comprometido = await comprometerAdicional(tx, productoId, delta, referenciaId, editadoPorId);
    if (!comprometido) {
      await tx.ordenCompra.create({
        data: {
          origen: "automatica",
          productoId,
          cantidadSolicitada: delta,
          estado: "pendiente_cotizar",
          referenciaAplicacionId: referenciaId,
          creadoPorId: editadoPorId,
        },
      });
    } else if (entregada) {
      await confirmarEntregaComprometida(tx, productoId, huertaId, delta, referenciaId, editadoPorId);
    }
    return;
  }

  const sobrante = -delta;
  if (!entregada) {
    // Bug real (3-sep-2026): esto asumía que TODO `cantidadAnterior` estaba
    // de verdad comprometido en Almacén, pero si el compromiso original
    // falló por falta de stock, lo que hay en su lugar es una compra
    // automática pendiente (ver intentarComprometer/comprometerAdicional),
    // nunca un lote descontado — liberarComprometido tronaba con "No hay
    // lote al que regresar el stock liberado." Ahora solo libera lo que de
    // verdad está comprometido (según el historial de movimientos) y el
    // resto simplemente reduce/cancela la compra pendiente.
    const comprometidos = await tx.almacenCentralMovimiento.findMany({
      where: { referenciaId, productoId, tipo: "salida_comprometida" },
    });
    const totalComprometido = comprometidos.reduce((s, m) => s + Number(m.cantidad), 0);
    const aLiberar = Math.min(sobrante, totalComprometido);
    if (aLiberar > 0.0001) {
      await liberarComprometido(tx, productoId, aLiberar, referenciaId, editadoPorId, "Ajuste de dosis — sobrante liberado antes de entregar.");
    }
    const sinComprometer = sobrante - aLiberar;
    if (sinComprometer > 0.0001) {
      await reducirCompraPendiente(tx, referenciaId, productoId, sinComprometer);
    }
    return;
  }

  const local = await tx.almacenLocal.update({
    where: { huertaId_productoId: { huertaId, productoId } },
    data: { cantidadRecibidaAcumulada: { decrement: sobrante } },
  });
  await tx.almacenLocalMovimiento.create({
    data: { almacenLocalId: local.id, tipo: "ajuste_manual", cantidad: -sobrante, referenciaId, capturadoPorId: editadoPorId },
  });
  // Regresa al/los lote(s) EXACTOS de donde salió, al precio con el que
  // salió (regla f, V1 P1 25-sep-2026) — antes iba "al primer lote del
  // producto" sin importar cuál.
  const desglose = await desgloseLotesDeMovimientos(tx, referenciaId, productoId, ["salida_real"]);
  const aplicado = await regresarProporcionalALotes(tx, desglose, sobrante);
  if (aplicado.length === 0) {
    const lote = await crearLoteRespaldo(tx, productoId, sobrante, "ABONO");
    await tx.almacenCentralMovimiento.create({
      data: { productoId, loteId: lote.id, tipo: "abono_sobrante", cantidad: sobrante, huertaDestinoId: huertaId, referenciaId, capturadoPorId: editadoPorId, confirmado: false },
    });
  } else {
    for (const p of aplicado) {
      await tx.almacenCentralMovimiento.create({
        data: {
          productoId,
          loteId: p.loteId,
          tipo: "abono_sobrante",
          cantidad: p.cantidad,
          huertaDestinoId: huertaId,
          referenciaId,
          capturadoPorId: editadoPorId,
          confirmado: false,
        },
      });
    }
  }
}

/**
 * Ajustes de dosis pendientes de confirmar por Bodega (9.7/9.5, 15-ago-2026)
 * — mismo tipo de aviso que una cancelación completa (bloque 6/9.15: "se te
 * va a regresar tal producto"), pero por movimiento individual (no por
 * Aplicación/Fertilización completa), porque una misma programación puede
 * ajustarse más de una vez. `huertaDestinoId`/`producto` ya viven en el
 * propio movimiento, así que esto sirve por igual sin importar si el
 * origen fue Aplicaciones o Fertilizantes.
 */
export async function listarAjustesPendientesConfirmar() {
  const movimientos = await prisma.almacenCentralMovimiento.findMany({
    where: { tipo: "abono_sobrante", confirmado: false },
    include: { producto: true },
    orderBy: { fecha: "asc" },
  });
  return Promise.all(
    movimientos.map(async (m) => {
      const huerta = m.huertaDestinoId ? await prisma.huerta.findUnique({ where: { id: m.huertaDestinoId } }) : null;
      return {
        id: m.id,
        tipo: "ajuste_dosis" as const,
        huerta: { nombre: huerta?.nombre ?? "—" },
        producto: { nombreComercial: m.producto.nombreComercial, unidad: m.producto.unidad },
        cantidadRegresada: Number(m.cantidad),
        fecha: m.fecha.toISOString(),
      };
    })
  );
}

export class AjusteInvalidoError extends Error {}

export async function confirmarRecepcionAjuste(movimientoId: string, confirmadoPorId: string) {
  const movimiento = await prisma.almacenCentralMovimiento.findUniqueOrThrow({ where: { id: movimientoId } });
  if (movimiento.tipo !== "abono_sobrante") {
    throw new AjusteInvalidoError("Este movimiento no es un abono por sobrante.");
  }
  if (movimiento.confirmado) {
    throw new AjusteInvalidoError("Ya se había confirmado la recepción de este ajuste.");
  }
  return prisma.almacenCentralMovimiento.update({
    where: { id: movimientoId },
    data: { confirmado: true, confirmadoPorId, fechaConfirmado: new Date() },
  });
}

export interface OverrideLoteEntrega {
  // Lote que Bodega eligió en vez del sugerido por FIFO al comprometer
  // (regla e) — reemplaza TODA la cantidad de esta entrega a ese único
  // lote (no reparte entre varios); si ese lote no alcanza, truena con
  // StockInsuficienteError y Bodega debe resolverlo a mano (elegir otro).
  loteIdElegido: string;
  motivo: string;
}

/**
 * Confirma la entrega física de un compromiso ya reservado (9.7/9.5, V1
 * P1 25-sep-2026): por default, el descuento FIFO ya ocurrió al
 * comprometer (regla del negocio: el lote se decide al programar, cuando
 * hay stock), así que aquí solo se espeja ese mismo desglose de lote(s)
 * en un movimiento "salida_real" de auditoría y se suma al Almacén Local
 * — nunca se vuelve a descontar del Central. Si Bodega, al momento de
 * entregar, dictamina que en realidad salió (o debe salir) de OTRO lote
 * (`opciones.loteIdElegido`), se revierte el descuento del lote
 * originalmente comprometido, se descuenta del lote elegido, y el
 * movimiento real queda marcado "fuera de orden" con su motivo.
 */
export async function confirmarEntregaComprometida(
  tx: TransactionClient,
  productoId: string,
  huertaId: string,
  cantidad: number,
  referenciaId: string,
  capturadoPorId: string,
  opciones?: OverrideLoteEntrega
) {
  const desglose = await desgloseLotesDeMovimientos(tx, referenciaId, productoId, ["salida_comprometida"]);
  const totalComprometido = desglose.reduce((s, p) => s + p.cantidad, 0);

  if (opciones && totalComprometido > 0.0001) {
    // Revierte el descuento del lote sugerido (todo lo comprometido para
    // esta referencia+producto) y lo vuelve a descontar del lote elegido.
    await regresarProporcionalALotes(tx, desglose, totalComprometido);
    const lote = await tx.productoLote.findUniqueOrThrow({ where: { id: opciones.loteIdElegido } });
    if (Number(lote.cantidadActual) + 0.0001 < cantidad) {
      throw new StockInsuficienteError(productoId, cantidad, Number(lote.cantidadActual));
    }
    await tx.productoLote.update({ where: { id: opciones.loteIdElegido }, data: { cantidadActual: { decrement: cantidad } } });
    await tx.almacenCentralMovimiento.create({
      data: {
        productoId,
        loteId: opciones.loteIdElegido,
        tipo: "salida_real",
        cantidad,
        huertaDestinoId: huertaId,
        referenciaId,
        capturadoPorId,
        fueraDeOrden: true,
        motivoFueraDeOrden: opciones.motivo,
      },
    });
  } else {
    // Sin override: espeja el desglose real del compromiso (regla f — al
    // precio del lote del que de verdad salió). Movimientos históricos sin
    // loteId (previos a este cambio) caen en el else — un solo renglón sin
    // lote, igual que se comportaba el sistema antes.
    if (desglose.length === 0) {
      await tx.almacenCentralMovimiento.create({
        data: { productoId, tipo: "salida_real", cantidad, huertaDestinoId: huertaId, referenciaId, capturadoPorId },
      });
    } else {
      for (const p of desglose) {
        await tx.almacenCentralMovimiento.create({
          data: { productoId, loteId: p.loteId, tipo: "salida_real", cantidad: p.cantidad, huertaDestinoId: huertaId, referenciaId, capturadoPorId },
        });
      }
    }
  }

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
