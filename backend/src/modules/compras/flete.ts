import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";

/**
 * El flete viaja con el producto (V1 P4, 27-sep-2026, 9.14): el costo real
 * de flete de una orden se prorratea por kilo (1 L cuenta como 1 kg;
 * productos en "pieza" quedan fuera del reparto, no tienen un peso real
 * conocido) entre todos los lotes de esa orden, y ajusta el costo de lo que
 * ya hubiera salido a una Huerta antes de capturarlo. Agrupado por
 * `OrdenCompra.numero` (el folio) porque una sola orden puede traer varios
 * productos, cada uno su propia fila de OrdenCompra — el flete es uno solo
 * para todo el folio, como en el ejemplo de Diego (1,000 kg de A + 500 L de
 * B, un solo flete de $750). NUNCA toca `OrdenCompra.precioUnitario` ni
 * Cuentas por Pagar (el flete lo cobra un tercero, no el Proveedor del
 * producto) — solo el `precioUnitario` de los movimientos `entrada_compra`.
 */

export class OrdenSinFolioError extends Error {
  constructor() {
    super("Esta orden todavía no tiene folio — no se puede marcar con flete.");
  }
}

export class FleteNoPendienteError extends Error {
  constructor() {
    super("Esta orden no está marcada como pendiente de capturar flete.");
  }
}

export class FleteYaCapturadoError extends Error {
  constructor() {
    super("El flete de esta orden ya se capturó — no se puede capturar dos veces.");
  }
}

export class FolioIncompletoError extends Error {
  constructor() {
    super("Todavía faltan líneas de esta orden por recibir — espera a que llegue todo el folio antes de capturar el flete.");
  }
}

export class SinPesoParaRepartirError extends Error {
  constructor() {
    super("Ninguno de los productos de esta orden se mide en kg/L — no hay entre qué repartir el flete.");
  }
}

/** Marca el folio de una orden como "vino con flete" (V1 P4) — se llama al confirmar CUALQUIER recepción de ese folio; idempotente, nunca desmarca. */
export async function marcarVinoConFleteTx(tx: TransactionClient, numero: number | null, marcadoPorId: string): Promise<void> {
  if (numero == null) throw new OrdenSinFolioError();
  const existente = await tx.ordenCompraFlete.findUnique({ where: { numero } });
  if (existente?.vinoConFlete) return;
  await tx.ordenCompraFlete.upsert({
    where: { numero },
    create: { numero, vinoConFlete: true, marcadoPorId, fechaMarcado: new Date() },
    update: { vinoConFlete: true, marcadoPorId, fechaMarcado: new Date() },
  });
}

async function folioEstaCompleto(numero: number): Promise<boolean> {
  const pendientes = await prisma.ordenCompra.count({ where: { numero, estado: "generada" } });
  return pendientes === 0;
}

/** Fletes marcados, pendientes de capturar el monto real (V1 P4) — para el panel de Compras y la Notificación a Dirección General. */
export async function listarFletesPendientes() {
  const fletes = await prisma.ordenCompraFlete.findMany({
    where: { vinoConFlete: true, montoTotal: null },
    orderBy: { fechaMarcado: "asc" },
  });
  return Promise.all(
    fletes.map(async (f) => {
      const lineas = await prisma.ordenCompra.findMany({
        where: { numero: f.numero },
        include: { producto: true, proveedor: true },
      });
      return { ...f, completo: await folioEstaCompleto(f.numero), lineas };
    })
  );
}

export interface ResultadoCapturaFlete {
  fletePorKg: number;
  totalKg: number;
  lineasAjustadas: number;
  ajustesHuerta: { huertaId: string; productoId: string; montoAjuste: number }[];
}

/**
 * Captura el flete real de un folio ya completo (V1 P4, 27-sep-2026):
 * reparte por kilo entre sus lotes (kg/L; "pieza" exento), sube el
 * precioUnitario de cada movimiento `entrada_compra`, y genera
 * AjusteCostoHuerta por lo que ya hubiera salido a una Huerta antes de este
 * momento.
 */
export async function capturarFleteOrden(numero: number, montoTotal: number, capturadoPorId: string): Promise<ResultadoCapturaFlete> {
  const flete = await prisma.ordenCompraFlete.findUnique({ where: { numero } });
  if (!flete?.vinoConFlete) throw new FleteNoPendienteError();
  if (flete.montoTotal != null) throw new FleteYaCapturadoError();
  if (!(await folioEstaCompleto(numero))) throw new FolioIncompletoError();

  const ordenes = await prisma.ordenCompra.findMany({ where: { numero, estado: "recibida" }, include: { producto: true } });
  const movimientos = await prisma.almacenCentralMovimiento.findMany({
    where: { tipo: "entrada_compra", referenciaId: { in: ordenes.map((o) => o.id) } },
  });

  const lineas = ordenes
    .map((o) => ({ orden: o, movimiento: movimientos.find((m) => m.referenciaId === o.id) }))
    .filter((l): l is { orden: (typeof ordenes)[number]; movimiento: (typeof movimientos)[number] } => l.movimiento != null);

  const kgPorLinea = (l: (typeof lineas)[number]) => (l.orden.producto.unidad === "kg" || l.orden.producto.unidad === "L" ? Number(l.movimiento.cantidad) : 0);
  const totalKg = lineas.reduce((s, l) => s + kgPorLinea(l), 0);
  if (totalKg <= 0) throw new SinPesoParaRepartirError();
  const fletePorKg = montoTotal / totalKg;

  const ajustesHuerta: ResultadoCapturaFlete["ajustesHuerta"] = [];

  await prisma.$transaction(async (tx) => {
    for (const l of lineas) {
      const kg = kgPorLinea(l);
      if (kg <= 0) continue; // producto en "pieza" — queda fuera del reparto

      await tx.almacenCentralMovimiento.update({
        where: { id: l.movimiento.id },
        data: { precioUnitario: Number(l.movimiento.precioUnitario ?? 0) + fletePorKg },
      });

      const salidas = await tx.almacenCentralMovimiento.findMany({
        where: { tipo: "salida_real", loteId: l.movimiento.loteId, huertaDestinoId: { not: null } },
      });
      const porHuerta = new Map<string, number>();
      for (const s of salidas) porHuerta.set(s.huertaDestinoId!, (porHuerta.get(s.huertaDestinoId!) ?? 0) + Number(s.cantidad));

      for (const [huertaId, cantidadYaEnviada] of porHuerta) {
        if (cantidadYaEnviada <= 0.0001) continue;
        const montoAjuste = cantidadYaEnviada * fletePorKg;
        await tx.ajusteCostoHuerta.create({
          data: {
            huertaId,
            productoId: l.orden.productoId,
            ordenCompraFleteId: flete.id,
            loteId: l.movimiento.loteId!,
            cantidadYaEnviada,
            fletePorKg,
            montoAjuste,
            capturadoPorId,
          },
        });
        ajustesHuerta.push({ huertaId, productoId: l.orden.productoId, montoAjuste });
      }
    }

    await tx.ordenCompraFlete.update({
      where: { id: flete.id },
      data: { montoTotal, capturadoPorId, fechaCaptura: new Date() },
    });
  });

  return { fletePorKg, totalKg, lineasAjustadas: lineas.filter((l) => kgPorLinea(l) > 0).length, ajustesHuerta };
}

/** Ajustes de costo por flete recibidos por una Huerta — para consulta/costeo. */
export function listarAjustesCostoHuerta(huertaId?: string) {
  return prisma.ajusteCostoHuerta.findMany({
    where: { huertaId },
    include: { producto: true, huerta: true },
    orderBy: { fecha: "desc" },
  });
}
