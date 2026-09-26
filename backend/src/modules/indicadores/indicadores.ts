import { prisma } from "../../core/db.js";

const EPSILON = 0.0001;

/**
 * Indicadores por Huerta (V1 P2, 25-sep-2026): costo promedio/ha e intervalo
 * entre pases, calculados SOLO sobre programaciones cerradas (100% de avance,
 * o canceladas con nota) — nunca una sola cifra global entre Huertas
 * (decisión explícita de Diego), y separado por módulo (Aplicaciones,
 * Granular, Actividades no se mezclan entre sí). Fertirriego queda fuera por
 * ahora: no tiene avance por hectáreas ni fecha de cierre propia (su
 * ejecución vive día a día en Riego, sin un evento de "100% completado").
 *
 * Costo de producto (Aplicaciones/Granular): se toma del costo REAL de los
 * lotes que salieron físicamente de Almacén Central para esa programación
 * (`salida_real` → su lote → el `precioUnitario` con el que entró ese lote),
 * no un precio de catálogo — el Producto no guarda un costo fijo, vive por
 * movimiento/compra. Si una programación se cerró por cancelación por debajo
 * de 100%, el costo de producto se prorratea al % que sí se avanzó (el resto
 * se regresó a Almacén vía "abono_sobrante").
 */

type Modulo = "aplicaciones" | "granular" | "actividades";
type OrigenNomina = "automatico_aplicacion" | "automatico_fertilizacion" | "automatico_actividad";

export interface IndicadorHuertaModulo {
  huertaId: string;
  huertaNombre: string;
  modulo: Modulo;
  numeroCierres: number;
  hectareasTotales: number;
  costoManoObraTotal: number;
  costoProductoTotal: number;
  costoTotal: number;
  costoPromedioPorHa: number | null;
  intervaloPromedioDias: number | null;
}

interface CierreInfo {
  programacionId: string;
  huertaId: string;
  hectareasAvanzadas: number;
  fechaCierre: Date;
  cancelada: boolean;
  porcentajeAvance: number;
  realizadaIds: string[];
}

function fechaMasReciente(fechas: Date[]): Date {
  return fechas.reduce((max, f) => (f > max ? f : max), fechas[0]!);
}

function calcularIntervaloPromedio(fechas: Date[]): number | null {
  if (fechas.length < 2) return null;
  const ordenadas = [...fechas].sort((a, b) => a.getTime() - b.getTime());
  let sumaDias = 0;
  for (let i = 1; i < ordenadas.length; i++) sumaDias += (ordenadas[i]!.getTime() - ordenadas[i - 1]!.getTime()) / 86_400_000;
  return sumaDias / (ordenadas.length - 1);
}

/** Costo real de producto entregado a un conjunto de programaciones, a partir de los lotes de donde salió físicamente (por programacionId). */
async function costoProductoPorProgramaciones(programacionIds: string[]): Promise<Map<string, number>> {
  const costoPorProgramacion = new Map<string, number>();
  if (programacionIds.length === 0) return costoPorProgramacion;
  const salidas = await prisma.almacenCentralMovimiento.findMany({
    where: { referenciaId: { in: programacionIds }, tipo: "salida_real", loteId: { not: null } },
  });
  if (salidas.length === 0) return costoPorProgramacion;
  const loteIds = [...new Set(salidas.map((s) => s.loteId!))];
  const entradas = await prisma.almacenCentralMovimiento.findMany({ where: { tipo: "entrada_compra", loteId: { in: loteIds } } });
  const precioPorLote = new Map(entradas.map((e) => [e.loteId!, e.precioUnitario != null ? Number(e.precioUnitario) : null]));
  for (const s of salidas) {
    const precio = precioPorLote.get(s.loteId!);
    if (precio == null) continue;
    const costo = Number(s.cantidad) * precio;
    costoPorProgramacion.set(s.referenciaId!, (costoPorProgramacion.get(s.referenciaId!) ?? 0) + costo);
  }
  return costoPorProgramacion;
}

async function construirIndicadores(
  cierres: CierreInfo[],
  huertasNombre: Map<string, string>,
  modulo: Modulo,
  origenNomina: OrigenNomina,
  incluirProducto: boolean
): Promise<IndicadorHuertaModulo[]> {
  const todosLosRealizadaIds = cierres.flatMap((c) => c.realizadaIds);
  const registrosNomina = todosLosRealizadaIds.length
    ? await prisma.registroNomina.findMany({ where: { referenciaOrigenId: { in: todosLosRealizadaIds }, origen: origenNomina } })
    : [];
  const costoManoObraPorHuerta = new Map<string, number>();
  for (const r of registrosNomina) {
    costoManoObraPorHuerta.set(r.huertaId, (costoManoObraPorHuerta.get(r.huertaId) ?? 0) + Number(r.cantidad) * Number(r.tarifaAplicada));
  }

  const costoProductoPorProgramacion = incluirProducto ? await costoProductoPorProgramaciones(cierres.map((c) => c.programacionId)) : new Map<string, number>();

  const porHuerta = new Map<string, { hectareas: number; costoProducto: number; fechasCierre: Date[] }>();
  for (const c of cierres) {
    const entry = porHuerta.get(c.huertaId) ?? { hectareas: 0, costoProducto: 0, fechasCierre: [] };
    entry.hectareas += c.hectareasAvanzadas;
    const costoProdProgramacion = costoProductoPorProgramacion.get(c.programacionId) ?? 0;
    // Cancelada por debajo de 100%: el costo de producto se prorratea a lo
    // realmente avanzado — el resto ya se regresó a Almacén.
    entry.costoProducto += c.cancelada ? costoProdProgramacion * c.porcentajeAvance : costoProdProgramacion;
    entry.fechasCierre.push(c.fechaCierre);
    porHuerta.set(c.huertaId, entry);
  }

  const resultado: IndicadorHuertaModulo[] = [];
  for (const [huertaId, entry] of porHuerta) {
    const costoManoObraTotal = costoManoObraPorHuerta.get(huertaId) ?? 0;
    const costoTotal = costoManoObraTotal + entry.costoProducto;
    resultado.push({
      huertaId,
      huertaNombre: huertasNombre.get(huertaId) ?? "",
      modulo,
      numeroCierres: entry.fechasCierre.length,
      hectareasTotales: entry.hectareas,
      costoManoObraTotal,
      costoProductoTotal: entry.costoProducto,
      costoTotal,
      costoPromedioPorHa: entry.hectareas > EPSILON ? costoTotal / entry.hectareas : null,
      intervaloPromedioDias: calcularIntervaloPromedio(entry.fechasCierre),
    });
  }
  return resultado;
}

async function indicadoresAplicaciones(): Promise<IndicadorHuertaModulo[]> {
  const aplicaciones = await prisma.aplicacion.findMany({
    where: { estado: { in: ["realizada", "cancelada"] } },
    include: { huerta: true, realizadas: { select: { id: true, fechaReal: true, hectareas: true } } },
  });
  const huertasNombre = new Map(aplicaciones.map((a) => [a.huertaId, a.huerta.nombre]));
  const cierres: CierreInfo[] = [];
  for (const a of aplicaciones) {
    if (a.realizadas.length === 0) continue;
    const hectareasAvanzadas = a.realizadas.reduce((s, r) => s + Number(r.hectareas), 0);
    const hectareasTotalesProgramadas = Number(a.hectareasTotalesProgramadas);
    const porcentajeAvance = hectareasTotalesProgramadas > 0 ? hectareasAvanzadas / hectareasTotalesProgramadas : 0;
    const cancelada = a.estado === "cancelada";
    if (!cancelada && porcentajeAvance < 1 - EPSILON) continue;
    cierres.push({
      programacionId: a.id,
      huertaId: a.huertaId,
      hectareasAvanzadas,
      fechaCierre: cancelada ? a.fechaCancelacion! : fechaMasReciente(a.realizadas.map((r) => r.fechaReal)),
      cancelada,
      porcentajeAvance,
      realizadaIds: a.realizadas.map((r) => r.id),
    });
  }
  return construirIndicadores(cierres, huertasNombre, "aplicaciones", "automatico_aplicacion", true);
}

async function indicadoresGranular(): Promise<IndicadorHuertaModulo[]> {
  const fertilizaciones = await prisma.fertilizacionGranular.findMany({
    where: { estado: { in: ["realizada", "cancelada"] } },
    include: { huerta: true, realizadas: { select: { id: true, fechaReal: true, hectareas: true } } },
  });
  const huertasNombre = new Map(fertilizaciones.map((f) => [f.huertaId, f.huerta.nombre]));
  const cierres: CierreInfo[] = [];
  for (const f of fertilizaciones) {
    if (f.realizadas.length === 0) continue;
    const hectareasAvanzadas = f.realizadas.reduce((s, r) => s + Number(r.hectareas), 0);
    const hectareasTotalesProgramadas = Number(f.hectareasTotalesProgramadas);
    const porcentajeAvance = hectareasTotalesProgramadas > 0 ? hectareasAvanzadas / hectareasTotalesProgramadas : 0;
    const cancelada = f.estado === "cancelada";
    if (!cancelada && porcentajeAvance < 1 - EPSILON) continue;
    cierres.push({
      programacionId: f.id,
      huertaId: f.huertaId,
      hectareasAvanzadas,
      fechaCierre: cancelada ? f.fechaCancelacion! : fechaMasReciente(f.realizadas.map((r) => r.fechaReal)),
      cancelada,
      porcentajeAvance,
      realizadaIds: f.realizadas.map((r) => r.id),
    });
  }
  return construirIndicadores(cierres, huertasNombre, "granular", "automatico_fertilizacion", true);
}

async function indicadoresActividades(): Promise<IndicadorHuertaModulo[]> {
  // Actividades no tiene protocolo de cancelación (no hay campo `estado`) —
  // el único cierre posible por ahora es llegar al 100% de avance.
  const programadas = await prisma.actividadProgramada.findMany({
    include: { huerta: true, realizadas: { select: { id: true, fechaReal: true, hectareas: true } } },
  });
  const huertasNombre = new Map(programadas.map((p) => [p.huertaId, p.huerta.nombre]));
  const cierres: CierreInfo[] = [];
  for (const p of programadas) {
    if (p.realizadas.length === 0) continue;
    const hectareasAvanzadas = p.realizadas.reduce((s, r) => s + Number(r.hectareas), 0);
    const hectareasTotalesProgramadas = Number(p.hectareasTotalesProgramadas);
    const porcentajeAvance = hectareasTotalesProgramadas > 0 ? hectareasAvanzadas / hectareasTotalesProgramadas : 0;
    if (porcentajeAvance < 1 - EPSILON) continue;
    cierres.push({
      programacionId: p.id,
      huertaId: p.huertaId,
      hectareasAvanzadas,
      fechaCierre: fechaMasReciente(p.realizadas.map((r) => r.fechaReal)),
      cancelada: false,
      porcentajeAvance,
      realizadaIds: p.realizadas.map((r) => r.id),
    });
  }
  return construirIndicadores(cierres, huertasNombre, "actividades", "automatico_actividad", false);
}

/** Indicadores de las 3 Huertas/módulos con datos suficientes (V1 P2, 25-sep-2026) — sin promedio global, `huertaId` filtra a una sola. */
export async function listarIndicadores(huertaId?: string): Promise<IndicadorHuertaModulo[]> {
  const [aplicaciones, granular, actividades] = await Promise.all([indicadoresAplicaciones(), indicadoresGranular(), indicadoresActividades()]);
  const todos = [...aplicaciones, ...granular, ...actividades];
  return huertaId ? todos.filter((i) => i.huertaId === huertaId) : todos;
}
