import { calcularFilaNominaSemanal, calcularPeriodoNomina, fijoDebePagarseEnPeriodo, pagosPorAnio, sumarDias, type FechaISO, type PeriodoNomina } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";
import { gananciaDestajoEnRango } from "./captura.js";
import { totalBonosAutorizadosPersonaEnPeriodo } from "./bonos.js";
import { congelarBonosAsistencia, montosBonoPorPersona, resumenBonoAsistencia } from "./bonoAsistencia.js";
import { aplicarDescuento, prestamoAplicaEnPeriodo } from "./prestamos.js";
import { marcarSemanaConfirmada, semanaEstaConfirmada, SemanaConfirmadaError } from "./semana-confirmada.js";

export interface FilaReporteSemanal {
  personalId: string;
  nombreCompleto: string;
  tipo: "fijo" | "destajo";
  bruto: number;
  // Incluye bonoAsistencia (abajo) más los bonos configurables ya autorizados.
  bonos: number;
  // Bono de Asistencia Semanal (V1 P7): en vivo hasta cerrar la semana, congelado después.
  bonoAsistencia: number;
  descuentoPrestamos: number;
  neto: number;
  prestamosAplicados: { prestamoId: string; monto: number; yaAplicado: boolean }[];
  // V1 P6, 27-sep-2026 (9.11c) — quién se paga en efectivo (aparece aquí,
  // se paga sábado) vs. transferencia (mensual, aparece en la lista de
  // pagos del viernes junto a proveedores — ver transferencias.ts).
  formaPago: "efectivo" | "transferencia";
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
/**
 * Sueldo del periodo de una persona fija (V1 P6, 27-sep-2026, 9.11b):
 * Personal.sueldo se entiende ANUAL — cada pago sale de sueldo ÷ pagos al
 * año de su periodicidad, para que gane lo mismo sin importar el esquema.
 * Además "atrapa" pagos que le tocaban en periodos anteriores sin cobrar
 * (alta pendiente de autorización, 9.11a) — recorre cada periodo semanal
 * desde `desde` hasta `periodo.fin` y suma los que sí le tocaban.
 */
function sueldoAcumuladoDesde(
  periodicidad: import("@cbf/shared").Periodicidad,
  sueldoAnual: number,
  diaCorteIndex: number,
  diaPagoMensual: "primer_viernes" | "ultimo_viernes" | null,
  desde: FechaISO,
  periodoActual: PeriodoNomina
): number {
  const sueldoDelPeriodo = sueldoAnual / pagosPorAnio(periodicidad);
  let total = 0;
  let cursorFin = calcularPeriodoNomina(desde, diaCorteIndex).fin;
  while (cursorFin <= periodoActual.fin) {
    const periodo = calcularPeriodoNomina(cursorFin, diaCorteIndex);
    if (fijoDebePagarseEnPeriodo(periodicidad, periodo, { diaPagoMensual })) total += sueldoDelPeriodo;
    cursorFin = sumarDias(cursorFin, 7);
  }
  return total;
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

  // Alta pendiente de autorización (V1 P6, 27-sep-2026, 9.11a): su día ya
  // cuenta como costo de Huerta desde que se capturó (RegistroNomina no
  // distingue esto — se sigue creando igual), pero no sale en NINGÚN pago
  // hasta que RH la autorice — por eso se excluye aquí desde el principio,
  // no solo del bruto.
  const personas = await prisma.personal.findMany({ where: { activo: true, pendienteAutorizacion: false }, include: { puesto: true } });
  // Bono de Asistencia Semanal: semana de asistencia anterior (Lun-Sáb), calculada al momento.
  const bonoAsistenciaPorPersona = montosBonoPorPersona(await resumenBonoAsistencia(hoy));

  const filas: FilaReporteSemanal[] = [];
  for (const persona of personas) {
    if (huertaId && persona.tipo === "fijo" && persona.huertaId !== huertaId) continue;

    // "Atrapa" lo que se acumuló mientras estuvo pendiente de autorización
    // (o cualquier semana saltada) — retoma desde el día siguiente a la
    // última vez que se le pagó/confirmó, no solo desde el inicio de ESTE
    // periodo. Si nunca se le ha confirmado nada (nominaPagadaHasta null),
    // se retoma desde su fechaIngreso — importante para quien estuvo varias
    // semanas pendiente de autorización: `periodo.inicio` (bug encontrado y
    // corregido en pruebas, V1 P6) perdía todo lo de semanas anteriores a
    // la actual en cuanto se autorizaba. Si tampoco hay fechaIngreso (dato
    // viejo sin capturar), se usa `periodo.inicio` como antes.
    const desde = persona.nominaPagadaHasta
      ? sumarDias(persona.nominaPagadaHasta.toISOString().slice(0, 10), 1)
      : persona.fechaIngreso
        ? persona.fechaIngreso.toISOString().slice(0, 10)
        : periodo.inicio;
    const gananciaDestajoPeriodo = await gananciaDestajoEnRango(persona.id, desde, periodo.fin, persona.tipo === "destajo" ? huertaId : undefined);

    let sueldoDelPeriodo = 0;
    if (persona.tipo === "fijo" && persona.puesto && persona.sueldo != null) {
      sueldoDelPeriodo = sueldoAcumuladoDesde(persona.puesto.periodicidad, Number(persona.sueldo), config.diaCorteIndex, persona.diaPagoMensual, desde, periodo);
    }

    const bonoAsistencia = bonoAsistenciaPorPersona.get(persona.id) ?? 0;
    const bonos = (await totalBonosAutorizadosPersonaEnPeriodo(persona.id, periodo.inicio, periodo.fin)) + bonoAsistencia;

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
      sueldo: sueldoDelPeriodo,
      debePagarseSueldoEstePeriodo: sueldoDelPeriodo > 0,
      gananciaDestajoPeriodo,
      bonos,
      descuentoPrestamos,
    });

    // Transferencia (9.11c, solo mensual): no sale en este reporte — sale
    // en la lista de pagos del viernes junto a proveedores (ver
    // transferencias.ts). `nominaPagadaHasta` igual avanza para todos abajo,
    // para no perder ni duplicar nada si cambia de forma de pago después.
    if (bruto > 0 && persona.formaPago === "transferencia") continue;

    if (bruto <= 0 && bonos <= 0 && descuentoPrestamos <= 0) continue;

    filas.push({
      personalId: persona.id,
      nombreCompleto: persona.nombreCompleto,
      tipo: persona.tipo,
      bruto,
      bonos,
      bonoAsistencia,
      descuentoPrestamos,
      neto,
      prestamosAplicados,
      formaPago: persona.formaPago,
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

  // El bono de asistencia se congela junto con el resto de los números de la semana.
  await congelarBonosAsistencia(hoy, confirmadoPorId);
  await marcarSemanaConfirmada(reporte.periodo.fin, confirmadoPorId);

  // Avanza `nominaPagadaHasta` de TODO el personal activo no-pendiente
  // (V1 P6, 27-sep-2026, 9.11a) — no solo quienes salieron en `filas` (a
  // alguien con $0 esta semana no le queda nada pendiente que "atrapar"
  // después, pero igual se marca al corriente). Las personas pendientes de
  // autorización NO avanzan — así, en cuanto se autoricen, su próximo
  // reporte retoma desde su fecha de ingreso y atrapa todo lo acumulado.
  await prisma.personal.updateMany({
    where: { activo: true, pendienteAutorizacion: false },
    data: { nominaPagadaHasta: new Date(reporte.periodo.fin) },
  });
}
