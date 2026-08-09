import { prisma } from "../../core/db.js";

export function almacenLocalDeHuerta(huertaId: string) {
  return prisma.almacenLocal.findMany({ where: { huertaId }, include: { producto: true } });
}

/**
 * Reporte de avance de aplicación (9.15): por ahora es una captura manual
 * del Supervisor ("reporté X aplicado") — cuando exista Aplicaciones, ese
 * módulo escribirá aquí mismo en vez de requerir este formulario.
 */
export async function reportarConsumo(almacenLocalId: string, cantidad: number, capturadoPorId: string) {
  return prisma.$transaction(async (tx) => {
    const local = await tx.almacenLocal.update({
      where: { id: almacenLocalId },
      data: { cantidadReportadaAcumulada: { increment: cantidad } },
    });
    await tx.almacenLocalMovimiento.create({
      data: { almacenLocalId, tipo: "consumo_reportado", cantidad, capturadoPorId },
    });
    return local;
  });
}

export interface CandadoAlmacenLocal {
  huertaId: string;
  productoId: string;
  nombreComercial: string;
  cantidadRecibida: number;
  cantidadReportada: number;
  saldoSinJustificar: number;
  diasDesdeUltimaEntrega: number | null;
  alertaActiva: boolean; // descuadre + más de 15 días sin justificar por completo
}

/**
 * Candado principal del Almacén Local (9.15): compara lo que salió del
 * Central hacia la Huerta contra lo justificado por reportes de consumo.
 * Si después de 15 días no cuadra, se marca la alerta.
 */
export async function candadosDeHuerta(huertaId: string): Promise<CandadoAlmacenLocal[]> {
  const locales = await prisma.almacenLocal.findMany({ where: { huertaId }, include: { producto: true } });
  const resultado: CandadoAlmacenLocal[] = [];

  for (const local of locales) {
    const recibida = Number(local.cantidadRecibidaAcumulada);
    const reportada = Number(local.cantidadReportadaAcumulada);
    const saldoSinJustificar = recibida - reportada;

    const ultimaEntrega = await prisma.almacenLocalMovimiento.findFirst({
      where: { almacenLocalId: local.id, tipo: "entrega" },
      orderBy: { fecha: "desc" },
    });
    const diasDesdeUltimaEntrega = ultimaEntrega
      ? Math.floor((Date.now() - ultimaEntrega.fecha.getTime()) / 86_400_000)
      : null;

    resultado.push({
      huertaId,
      productoId: local.productoId,
      nombreComercial: local.producto.nombreComercial,
      cantidadRecibida: recibida,
      cantidadReportada: reportada,
      saldoSinJustificar,
      diasDesdeUltimaEntrega,
      alertaActiva: saldoSinJustificar > 0.0001 && (diasDesdeUltimaEntrega ?? 0) > 15,
    });
  }
  return resultado;
}
