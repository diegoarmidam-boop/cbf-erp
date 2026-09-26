import { prisma } from "../../core/db.js";

/**
 * Traslado de tractor entre ranchos (V1 P3, 26-sep-2026, 9.13e): la única
 * forma de cambiar el "Rancho actual" de un tractor — así el historial de
 * Traslados es siempre su bitácora completa, nunca hay un cambio "silencioso"
 * por edición directa. El combustible del traslado es gasto INDIRECTO de la
 * empresa (no se liga a ninguna Huerta ni a CombustibleCarga).
 */
export class TrasladoSoloParaTractoresError extends Error {
  constructor() {
    super("El Traslado entre ranchos solo aplica a Tractores.");
  }
}

export class TractorEnOtroRanchoError extends Error {
  constructor(nombreRanchoActual: string) {
    super(`Este tractor tiene su "Rancho actual" en ${nombreRanchoActual} — registra primero su Traslado a este rancho antes de usarlo aquí.`);
  }
}

export interface RegistrarTrasladoInput {
  equipoId: string;
  fecha: string;
  huertaDestinoId: string;
  litros: number;
  fotoUrl: string;
}

/** Registra un Traslado y actualiza el "Rancho actual" del tractor — lo hace el Supervisor del rancho DESTINO. */
export async function registrarTraslado(input: RegistrarTrasladoInput, registradoPorId: string) {
  const equipo = await prisma.equipo.findUniqueOrThrow({ where: { id: input.equipoId } });
  if (equipo.tipo !== "tractor") throw new TrasladoSoloParaTractoresError();

  return prisma.$transaction(async (tx) => {
    const traslado = await tx.equipoTraslado.create({
      data: {
        equipoId: input.equipoId,
        fecha: new Date(input.fecha),
        huertaOrigenId: equipo.ranchoActualId,
        huertaDestinoId: input.huertaDestinoId,
        litros: input.litros,
        fotoUrl: input.fotoUrl,
        registradoPorId,
      },
    });
    await tx.equipo.update({ where: { id: input.equipoId }, data: { ranchoActualId: input.huertaDestinoId } });
    return traslado;
  });
}

export function historialTraslados(equipoId: string) {
  return prisma.equipoTraslado.findMany({
    where: { equipoId },
    include: { huertaOrigen: true, huertaDestino: true },
    orderBy: { fecha: "desc" },
  });
}

/**
 * Candado de un avance con tractor (9.13e): si el tractor ya tiene un
 * "Rancho actual" asignado y no coincide con la Huerta del avance, bloquea y
 * pide registrar el Traslado primero. Si nunca se le ha asignado uno
 * (ranchoActualId null — equipo recién dado de alta, o histórico previo a
 * este campo), no bloquea todavía.
 */
export async function verificarRanchoDelTractor(tractorId: string, huertaAvanceId: string): Promise<void> {
  const equipo = await prisma.equipo.findUniqueOrThrow({ where: { id: tractorId }, include: { ranchoActual: true } });
  if (equipo.ranchoActualId && equipo.ranchoActualId !== huertaAvanceId) {
    throw new TractorEnOtroRanchoError(equipo.ranchoActual!.nombre);
  }
}
