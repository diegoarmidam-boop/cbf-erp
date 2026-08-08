import { calcularFilaNominaSemanal, calcularPeriodoNomina, semanaDelMesDePeriodo, fijoDebePagarseEnPeriodo, type FechaISO, type PeriodoNomina } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";
import { gananciaDestajoEnRango } from "./captura.js";
import { totalBonosAutorizadosPersonaEnPeriodo } from "./bonos.js";
import { aplicarDescuento, prestamoAplicaEnPeriodo } from "./prestamos.js";

export interface FilaReporteSemanal {
  personalId: string;
  nombreCompleto: string;
  tipo: "fijo" | "destajo";
  bruto: number;
  bonos: number;
  descuentoPrestamos: number;
  neto: number;
  prestamosAplicados: { prestamoId: string; monto: number }[];
}

export interface ReporteNominaSemanal {
  periodo: PeriodoNomina;
  filas: FilaReporteSemanal[];
}

export async function generarReporteNominaSemanal(hoy: FechaISO): Promise<ReporteNominaSemanal> {
  const config = await obtenerConfigNomina();
  const periodo = calcularPeriodoNomina(hoy, config.diaCorteIndex);
  const semanaInfo = semanaDelMesDePeriodo(periodo.fin, config.diaCorteIndex);

  const personas = await prisma.personal.findMany({ where: { activo: true }, include: { puesto: true } });

  const filas: FilaReporteSemanal[] = [];
  for (const persona of personas) {
    const gananciaDestajoPeriodo = await gananciaDestajoEnRango(persona.id, periodo.inicio, periodo.fin);
    const debePagarseSueldoEstePeriodo =
      persona.tipo === "fijo" && persona.puesto ? fijoDebePagarseEnPeriodo(persona.puesto.periodicidad, periodo, semanaInfo) : false;
    const bonos = await totalBonosAutorizadosPersonaEnPeriodo(persona.id, periodo.inicio, periodo.fin);

    const prestamosActivos = await prisma.prestamo.findMany({ where: { personalId: persona.id, activo: true } });
    const prestamosQueAplican = prestamosActivos.filter((pr) =>
      prestamoAplicaEnPeriodo(pr.proximoDescuento.toISOString().slice(0, 10), periodo.fin)
    );
    const prestamosAplicados = prestamosQueAplican.map((pr) => ({
      prestamoId: pr.id,
      monto: Math.min(Number(pr.montoPorDescuento), Number(pr.saldoPendiente)),
    }));
    const descuentoPrestamos = prestamosAplicados.reduce((s, p) => s + p.monto, 0);

    const { bruto, neto } = calcularFilaNominaSemanal({
      tipo: persona.tipo,
      sueldo: persona.sueldo != null ? Number(persona.sueldo) : null,
      debePagarseSueldoEstePeriodo,
      gananciaDestajoPeriodo,
      bonos,
      descuentoPrestamos,
    });

    if (bruto <= 0 && bonos <= 0 && descuentoPrestamos <= 0) continue;

    filas.push({
      personalId: persona.id,
      nombreCompleto: persona.nombreCompleto,
      tipo: persona.tipo,
      bruto,
      bonos,
      descuentoPrestamos,
      neto,
      prestamosAplicados,
    });
  }

  filas.sort((a, b) => b.bruto - a.bruto);
  return { periodo, filas };
}

/**
 * Confirma la semana: aplica de verdad los descuentos de préstamo
 * proyectados en el reporte (avanza saldoPendiente/proximoDescuento) — es
 * la acción irreversible que exige pantalla de revisión antes de confirmar
 * (bloque 5). El resto del reporte (sueldos, destajo, bonos) no requiere
 * "aplicarse": ya está en registros_nomina/bonoOtorgado.
 */
export async function confirmarNominaSemanal(hoy: FechaISO, confirmadoPorId: string): Promise<void> {
  const reporte = await generarReporteNominaSemanal(hoy);
  for (const fila of reporte.filas) {
    for (const p of fila.prestamosAplicados) {
      await aplicarDescuento(p.prestamoId, confirmadoPorId, reporte.periodo.fin);
    }
  }
}
