import { calcularFilaNominaSemanal, calcularPeriodoNomina, semanaDelMesDePeriodo, fijoDebePagarseEnPeriodo, type FechaISO, type PeriodoNomina } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";
import { gananciaDestajoEnRango } from "./captura.js";
import { totalBonosAutorizadosPersonaEnPeriodo } from "./bonos.js";
import { aplicarDescuento, prestamoAplicaEnPeriodo } from "./prestamos.js";
import { marcarSemanaConfirmada, semanaEstaConfirmada, SemanaConfirmadaError } from "./semana-confirmada.js";

export interface FilaReporteSemanal {
  personalId: string;
  nombreCompleto: string;
  tipo: "fijo" | "destajo";
  bruto: number;
  bonos: number;
  descuentoPrestamos: number;
  neto: number;
  prestamosAplicados: { prestamoId: string; monto: number; yaAplicado: boolean }[];
}

export interface ReporteNominaSemanal {
  periodo: PeriodoNomina;
  filas: FilaReporteSemanal[];
  confirmada: boolean;
}

// "Todas UPs vs. por Huerta" (29-ago-2026, mismo principio que Captura del
// día): sin `huertaId`, agrega como siempre (default, sin cambios de
// comportamiento — es lo único que existía antes). Con `huertaId`, filtra
// a solo lo que corresponde a esa Huerta: destajo ganado ahí esa semana, y
// personal fijo asignado ahí (Personal.huertaId) — bonos y descuentos de
// préstamo no tienen Huerta en el modelo de datos (son por persona, no por
// Huerta), así que se muestran completos donde sea que la persona aparezca.
export async function generarReporteNominaSemanal(hoy: FechaISO, huertaId?: string): Promise<ReporteNominaSemanal> {
  const config = await obtenerConfigNomina();
  const periodo = calcularPeriodoNomina(hoy, config.diaCorteIndex);
  const semanaInfo = semanaDelMesDePeriodo(periodo.fin, config.diaCorteIndex);

  const personas = await prisma.personal.findMany({ where: { activo: true }, include: { puesto: true } });

  const filas: FilaReporteSemanal[] = [];
  for (const persona of personas) {
    if (huertaId && persona.tipo === "fijo" && persona.huertaId !== huertaId) continue;
    const gananciaDestajoPeriodo = await gananciaDestajoEnRango(persona.id, periodo.inicio, periodo.fin, persona.tipo === "destajo" ? huertaId : undefined);
    const debePagarseSueldoEstePeriodo =
      persona.tipo === "fijo" && persona.puesto ? fijoDebePagarseEnPeriodo(persona.puesto.periodicidad, periodo, semanaInfo) : false;
    const bonos = await totalBonosAutorizadosPersonaEnPeriodo(persona.id, periodo.inicio, periodo.fin);

    // Bug corregido (8-ago-2026): antes esto era pura proyección a partir de
    // proximoDescuento — en cuanto se aplicaba de verdad, proximoDescuento
    // avanzaba al siguiente periodo y el descuento "desaparecía" del reporte
    // de ESTE periodo (columna quedaba en $0.00). Ahora primero se busca si
    // ya existe un PrestamoDescuento real para este periodo exacto (lo que
    // de verdad se descontó) y solo se recurre a la proyección si todavía
    // no se ha aplicado.
    const prestamosDelPersona = await prisma.prestamo.findMany({
      where: { personalId: persona.id },
      include: { descuentos: { where: { periodoFin: new Date(periodo.fin) } } },
    });
    const prestamosAplicados: { prestamoId: string; monto: number; yaAplicado: boolean }[] = [];
    for (const pr of prestamosDelPersona) {
      const descuentoExistente = pr.descuentos[0];
      if (descuentoExistente) {
        prestamosAplicados.push({ prestamoId: pr.id, monto: Number(descuentoExistente.monto), yaAplicado: true });
      } else if (pr.activo && prestamoAplicaEnPeriodo(pr.proximoDescuento.toISOString().slice(0, 10), periodo.fin)) {
        prestamosAplicados.push({ prestamoId: pr.id, monto: Math.min(Number(pr.montoPorDescuento), Number(pr.saldoPendiente)), yaAplicado: false });
      }
    }
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
  return { periodo, filas, confirmada: await semanaEstaConfirmada(periodo.fin) };
}

/**
 * Confirma la semana: aplica de verdad los descuentos de préstamo
 * proyectados en el reporte (avanza saldoPendiente/proximoDescuento) — es
 * la acción irreversible que exige pantalla de revisión antes de confirmar
 * (bloque 5). El resto del reporte (sueldos, destajo, bonos) no requiere
 * "aplicarse": ya está en registros_nomina/bonoOtorgado.
 *
 * Candado permanente (29-ago-2026): al confirmar, la semana queda marcada
 * como pagada — desde ese momento ninguna función de escritura de Nómina
 * (guardarCapturaDelDia, autorizarBono/rechazarBono, aplicarDescuento)
 * vuelve a aceptar cambios para esa semana, sin excepción de rol. Por eso
 * los descuentos de préstamo se aplican ANTES de marcar el candado — si se
 * marcara primero, aplicarDescuento se bloquearía a sí mismo.
 */
export async function confirmarNominaSemanal(hoy: FechaISO, confirmadoPorId: string): Promise<void> {
  const reporte = await generarReporteNominaSemanal(hoy);
  if (reporte.confirmada) throw new SemanaConfirmadaError(reporte.periodo.fin);

  for (const fila of reporte.filas) {
    for (const p of fila.prestamosAplicados) {
      if (p.yaAplicado) continue; // ya se descontó antes (ej. por el botón individual de Préstamos) — no se vuelve a aplicar
      await aplicarDescuento(p.prestamoId, confirmadoPorId, reporte.periodo.fin);
    }
  }

  await marcarSemanaConfirmada(reporte.periodo.fin, confirmadoPorId);
}
