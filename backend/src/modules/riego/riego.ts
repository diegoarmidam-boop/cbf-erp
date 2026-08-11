import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";

export class FertirriegoNoActivoError extends Error {
  constructor() {
    super("No hay un fertirriego programado y entregado para esta Sección en esta fecha.");
  }
}

export class MotivoNoAplicadoRequeridoError extends Error {
  constructor() {
    super("Había un fertirriego programado y entregado para esta Sección hoy que no se metió — falta el motivo.");
  }
}

/**
 * El fertirriego vigente de una Sección en una fecha (9.5/9.6): programado
 * por Sección, entregado a la Huerta, y dentro de su rango de fechas. Si
 * hay más de uno vigente (caso raro), se toma el más reciente.
 */
async function fertirriegoVigente(tx: TransactionClient | typeof prisma, seccionId: string, fecha: Date) {
  const vinculo = await tx.fertirriegoSeccion.findFirst({
    where: {
      seccionId,
      fertirriego: { estado: "entregada", fechaInicio: { lte: fecha }, fechaFin: { gte: fecha } },
    },
    include: { fertirriego: { include: { producto: true } } },
    orderBy: { fertirriego: { fechaCreacion: "desc" } },
  });
  return vinculo?.fertirriego ?? null;
}

/** Para que la pantalla sepa si ofrecer la casilla "¿se metió el fertirriego?" (9.6). */
export async function fertirriegoActivoDeSeccion(seccionId: string, fecha: string) {
  const fertirriego = await fertirriegoVigente(prisma, seccionId, new Date(fecha));
  if (!fertirriego) return null;
  return { fertirriegoId: fertirriego.id, producto: fertirriego.producto };
}

export function obtenerRiegoDiario(seccionId: string, fecha: string) {
  return prisma.riegoRegistroDiario.findUnique({ where: { seccionId_fecha: { seccionId, fecha: new Date(fecha) } } });
}

export function historialRiego(seccionId: string) {
  return prisma.riegoRegistroDiario.findMany({ where: { seccionId }, orderBy: { fecha: "desc" } });
}

export interface RegistrarRiegoInput {
  horas: number;
  fertirriegoConfirmado: boolean;
  cantidadAplicada?: number;
  motivoNoAplicado?: string;
}

/**
 * Captura diaria por Sección de Riego (9.6): horas regadas (histórico,
 * nunca genera mano de obra — el Regador es rol fijo) y, si hay un
 * fertirriego vigente ya entregado, cuánto se metió ese día — ese consumo
 * descuenta directo el Almacén Local de la Huerta, mismo mecanismo que
 * Aplicaciones/Fertilización granular. Editar un día ya capturado ajusta
 * el descuento por la diferencia en vez de volver a descontar todo.
 */
export async function registrarRiegoDiario(seccionId: string, fecha: string, input: RegistrarRiegoInput, capturadoPorId: string) {
  const fechaDate = new Date(fecha);
  const seccion = await prisma.seccionRiego.findUniqueOrThrow({ where: { id: seccionId } });

  const cantidadNueva = input.fertirriegoConfirmado ? (input.cantidadAplicada ?? 0) : 0;

  // Candado (9.6): si había un fertirriego programado/entregado ese día y no se metió, exige motivo — no se guarda en silencio.
  const fertirriegoDelDia = await fertirriegoVigente(prisma, seccionId, fechaDate);
  if (fertirriegoDelDia && !input.fertirriegoConfirmado && !input.motivoNoAplicado?.trim()) {
    throw new MotivoNoAplicadoRequeridoError();
  }
  const motivoNoAplicado = fertirriegoDelDia && !input.fertirriegoConfirmado ? input.motivoNoAplicado : undefined;

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.riegoRegistroDiario.findUnique({ where: { seccionId_fecha: { seccionId, fecha: fechaDate } } });
    const cantidadAnterior = anterior?.fertirriegoConfirmado ? Number(anterior.cantidadAplicada ?? 0) : 0;
    const delta = cantidadNueva - cantidadAnterior;

    if (delta !== 0) {
      const fertirriego = await fertirriegoVigente(tx, seccionId, fechaDate);
      if (!fertirriego) throw new FertirriegoNoActivoError();

      const local = await tx.almacenLocal.upsert({
        where: { huertaId_productoId: { huertaId: seccion.huertaId, productoId: fertirriego.productoId } },
        update: { cantidadReportadaAcumulada: { increment: delta } },
        create: { huertaId: seccion.huertaId, productoId: fertirriego.productoId, cantidadReportadaAcumulada: Math.max(delta, 0) },
      });
      await tx.almacenLocalMovimiento.create({
        data: {
          almacenLocalId: local.id,
          tipo: delta > 0 ? "consumo_reportado" : "ajuste_manual",
          cantidad: Math.abs(delta),
          capturadoPorId,
        },
      });
    }

    return tx.riegoRegistroDiario.upsert({
      where: { seccionId_fecha: { seccionId, fecha: fechaDate } },
      update: {
        horas: input.horas,
        fertirriegoConfirmado: input.fertirriegoConfirmado,
        cantidadAplicada: cantidadNueva,
        motivoNoAplicado: motivoNoAplicado ?? null,
        capturadoPorId,
      },
      create: {
        seccionId,
        fecha: fechaDate,
        horas: input.horas,
        fertirriegoConfirmado: input.fertirriegoConfirmado,
        cantidadAplicada: cantidadNueva,
        motivoNoAplicado,
        capturadoPorId,
      },
    });
  });
}

/**
 * Vista "Todas UPs" (9.6, mismo patrón que Nómina 9.11): una Huerta por
 * tarjeta, con todas sus Secciones de Riego como filas, para capturar el
 * día completo sin ir cambiando de Huerta en un selector.
 */
export async function estadoRiegoTodasUPs(fecha: string, huertaIdAlcance?: string) {
  const huertas = await prisma.huerta.findMany({
    where: { activo: true, ...(huertaIdAlcance ? { id: huertaIdAlcance } : {}) },
    orderBy: { nombre: "asc" },
  });
  const fechaDate = new Date(fecha);

  return Promise.all(
    huertas.map(async (huerta) => {
      const secciones = await prisma.seccionRiego.findMany({ where: { huertaId: huerta.id }, orderBy: { nombre: "asc" } });
      const filas = await Promise.all(
        secciones.map(async (seccion) => {
          const [registro, fertirriegoActivo] = await Promise.all([
            prisma.riegoRegistroDiario.findUnique({ where: { seccionId_fecha: { seccionId: seccion.id, fecha: fechaDate } } }),
            fertirriegoActivoDeSeccion(seccion.id, fecha),
          ]);
          return { seccion, registro, fertirriegoActivo };
        })
      );
      return { huerta, secciones: filas };
    })
  );
}

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Lunes a domingo de la semana calendario que contiene `fechaRef` (para el historial visual — no es el periodo de Nómina). */
function semanaLunesADomingo(fechaRef: Date): Date[] {
  const dow = fechaRef.getDay();
  const diffALunes = dow === 0 ? -6 : 1 - dow;
  const lunes = new Date(fechaRef);
  lunes.setDate(lunes.getDate() + diffALunes);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Historial visual semanal (9.6): tabla tipo calendario, Secciones × días, con indicador de fertirriego aplicado. */
export async function historialSemanal(huertaId: string, fechaRef: string) {
  const dias = semanaLunesADomingo(new Date(fechaRef));
  const secciones = await prisma.seccionRiego.findMany({ where: { huertaId }, orderBy: { nombre: "asc" } });
  const registros = await prisma.riegoRegistroDiario.findMany({
    where: { seccionId: { in: secciones.map((s) => s.id) }, fecha: { gte: dias[0], lte: dias[6] } },
  });

  return {
    dias: dias.map((d, i) => ({ fecha: d.toISOString().slice(0, 10), etiqueta: DIAS_SEMANA[i] })),
    secciones: secciones.map((seccion) => ({
      seccion,
      dias: dias.map((d) => {
        const iso = d.toISOString().slice(0, 10);
        const registro = registros.find((r) => r.seccionId === seccion.id && r.fecha.toISOString().slice(0, 10) === iso);
        return {
          fecha: iso,
          horas: registro ? Number(registro.horas) : null,
          fertirriegoAplicado: registro?.fertirriegoConfirmado ?? false,
        };
      }),
    })),
  };
}
