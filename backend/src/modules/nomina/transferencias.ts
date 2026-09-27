import { calcularPeriodoNomina, fijoDebePagarseEnPeriodo, pagosPorAnio, sumarDias, type FechaISO } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";
import { totalBonosAutorizadosPersonaEnPeriodo } from "./bonos.js";

export interface TransferenciaNomina {
  personalId: string;
  nombreCompleto: string;
  monto: number;
  banco: string | null;
  numeroCuentaOClabe: string | null;
  titularCuenta: string | null;
}

/**
 * Personal mensual con forma de pago transferencia (V1 P6, 27-sep-2026,
 * 9.11c) cuyo pago cae EN el viernes dado — a diferencia del efectivo (se
 * paga el sábado siguiente al cierre), la transferencia se procesa el mismo
 * viernes, junto con los pagos a Proveedores. `viernesISO` debe ser un
 * viernes; se valida contra el `periodo.inicio` de esa semana (los periodos
 * de Nómina siempre empiezan viernes).
 */
export async function listarTransferenciasDelViernes(viernesISO: FechaISO): Promise<TransferenciaNomina[]> {
  const config = await obtenerConfigNomina();
  const periodo = calcularPeriodoNomina(viernesISO, config.diaCorteIndex);
  if (periodo.inicio !== viernesISO) return []; // no es un viernes de inicio de periodo — nada que pagar

  const personas = await prisma.personal.findMany({
    where: { activo: true, pendienteAutorizacion: false, tipo: "fijo", formaPago: "transferencia", sueldo: { not: null } },
    include: { puesto: true },
  });

  const resultado: TransferenciaNomina[] = [];
  for (const persona of personas) {
    if (!persona.puesto) continue;
    if (!fijoDebePagarseEnPeriodo(persona.puesto.periodicidad, periodo, { diaPagoMensual: persona.diaPagoMensual })) continue;

    // Igual que el reporte semanal (mismo bug encontrado y corregido ahí):
    // si nunca se le ha confirmado nada, se retoma desde su fechaIngreso,
    // no desde `periodo.inicio` — si no, se pierde lo acumulado en semanas
    // previas a la actual en cuanto se autoriza.
    const desde = persona.nominaPagadaHasta
      ? sumarDias(persona.nominaPagadaHasta.toISOString().slice(0, 10), 1)
      : persona.fechaIngreso
        ? persona.fechaIngreso.toISOString().slice(0, 10)
        : periodo.inicio;
    // Atrapa periodos anteriores no pagados (alta pendiente ya autorizada,
    // etc.) recorriendo semana por semana.
    let sueldoAcumulado = 0;
    let cursorFin = calcularPeriodoNomina(desde, config.diaCorteIndex).fin;
    while (cursorFin <= periodo.fin) {
      const p = calcularPeriodoNomina(cursorFin, config.diaCorteIndex);
      if (fijoDebePagarseEnPeriodo(persona.puesto.periodicidad, p, { diaPagoMensual: persona.diaPagoMensual })) {
        sueldoAcumulado += Number(persona.sueldo) / pagosPorAnio(persona.puesto.periodicidad);
      }
      cursorFin = sumarDias(cursorFin, 7);
    }

    const bonos = await totalBonosAutorizadosPersonaEnPeriodo(persona.id, periodo.inicio, periodo.fin);
    const monto = Math.ceil(sueldoAcumulado + bonos);
    if (monto <= 0) continue;

    resultado.push({
      personalId: persona.id,
      nombreCompleto: persona.nombreCompleto,
      monto,
      banco: persona.banco,
      numeroCuentaOClabe: persona.numeroCuentaOClabe,
      titularCuenta: persona.titularCuenta,
    });
  }
  return resultado;
}
