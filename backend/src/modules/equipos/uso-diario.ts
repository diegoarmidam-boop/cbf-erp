import { prisma } from "../../core/db.js";

export function listarUsoDiario(equipoId: string) {
  return prisma.equipoUsoDiario.findMany({
    where: { equipoId },
    include: { operador: { select: { nombreCompleto: true } }, huerta: { select: { nombre: true } } },
    orderBy: { fecha: "desc" },
  });
}

/** Solo control/trazabilidad — no genera cargo contable por Cuadro (9.13). Implementos toman las horas del tractor que los jaló, no capturan uso propio aparte. */
export function registrarUsoDiario(equipoId: string, fecha: string, operadorId: string, horas: number, huertaId: string) {
  return prisma.equipoUsoDiario.create({ data: { equipoId, fecha: new Date(fecha), operadorId, horas, huertaId } });
}
