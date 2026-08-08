import {
  calcularBonoAsistenciaPerfecta,
  calcularExtraDiaDoble,
  calcularRachaPermanencia,
  diasTrabajadosEnRango,
  semanasParaEvaluarRacha,
  ventanaAsistenciaPerfecta,
  type FechaISO,
} from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { gananciaDestajoEnRango } from "./captura.js";

interface AsistenciaPerfectaParams {
  diasRequeridos: number;
  monto: number;
}
interface PermanenciaRachaParams {
  mesesRequeridos: number;
  monto: number;
}
interface DiaDobleParams {
  multiplicador: number;
}

async function fechasConActividad(personalId: string, fechaIni: FechaISO, fechaFin: FechaISO): Promise<FechaISO[]> {
  const registros = await prisma.registroNomina.findMany({
    where: {
      fecha: { gte: new Date(fechaIni), lte: new Date(fechaFin) },
      OR: [{ personalId }, { grupo: { miembros: { some: { personalId } } } }],
    },
    select: { fecha: true },
  });
  return registros.map((r) => r.fecha.toISOString().slice(0, 10));
}

async function evaluarAsistenciaPerfecta(personalId: string, hoy: FechaISO, params: AsistenciaPerfectaParams) {
  const ventana = ventanaAsistenciaPerfecta(hoy, params.diasRequeridos);
  const fechas = await fechasConActividad(personalId, ventana.inicio, ventana.fin);
  const dias = diasTrabajadosEnRango(fechas, ventana.inicio, ventana.fin);
  return calcularBonoAsistenciaPerfecta(dias, params);
}

async function evaluarPermanenciaRacha(personalId: string, hoy: FechaISO, params: PermanenciaRachaParams) {
  const { semanas, semanasNecesarias } = semanasParaEvaluarRacha(hoy, params.mesesRequeridos);
  const cumplioSemana: boolean[] = [];
  for (const semana of semanas) {
    const fechas = await fechasConActividad(personalId, semana.inicioSemana, semana.finSemana);
    const dias = diasTrabajadosEnRango(fechas, semana.inicioSemana, semana.finSemana);
    const compromisoRoto = await prisma.compromisoEspecial.findFirst({
      where: {
        personalId,
        fecha: { gte: new Date(semana.inicioSemana), lte: new Date(semana.finSemana) },
        cumplido: false,
      },
    });
    cumplioSemana.push(dias.size >= 6 && !compromisoRoto);
    if (!cumplioSemana[cumplioSemana.length - 1]) break; // se detiene en la primera que falla
  }
  return calcularRachaPermanencia(cumplioSemana, semanasNecesarias, params.monto);
}

async function evaluarDiaDoble(personalId: string, fechasEspeciales: FechaISO[], params: DiaDobleParams) {
  let extra = 0;
  const detalle: { fecha: FechaISO; pagoNormalDia: number; extraDia: number }[] = [];
  for (const fecha of fechasEspeciales) {
    const pagoNormalDia = await gananciaDestajoEnRango(personalId, fecha, fecha);
    if (pagoNormalDia <= 0) continue;
    const extraDia = calcularExtraDiaDoble(pagoNormalDia, params.multiplicador);
    extra += extraDia;
    detalle.push({ fecha, pagoNormalDia, extraDia });
  }
  return { monto: extra, detalle };
}

/**
 * Calcula (sin persistir) cuánto le tocaría a `personalId` de un BonoConfig
 * específico, evaluado "hoy". Los bonos SIEMPRE requieren autorización
 * manual aunque el sistema los calcule solo (bloque 9.11) — este cálculo es
 * el insumo para generar el BonoOtorgado pendiente, no un pago directo.
 */
export async function calcularBonoParaPersona(bonoConfigId: string, personalId: string, hoy: FechaISO): Promise<number> {
  const bono = await prisma.bonoConfig.findUniqueOrThrow({ where: { id: bonoConfigId }, include: { diasEspeciales: true } });
  if (bono.tipo === "asistencia_perfecta") {
    const r = await evaluarAsistenciaPerfecta(personalId, hoy, bono.parametros as unknown as AsistenciaPerfectaParams);
    return r.monto;
  }
  if (bono.tipo === "permanencia_racha") {
    const r = await evaluarPermanenciaRacha(personalId, hoy, bono.parametros as unknown as PermanenciaRachaParams);
    return r.monto;
  }
  if (bono.tipo === "dia_doble") {
    const fechas = bono.diasEspeciales.map((d) => d.fecha.toISOString().slice(0, 10));
    const r = await evaluarDiaDoble(personalId, fechas, bono.parametros as unknown as DiaDobleParams);
    return r.monto;
  }
  return 0;
}

/**
 * Genera (upsert, sin duplicar) los BonoOtorgado pendientes de autorizar
 * para todo el personal de destajo, para el periodo de nómina indicado.
 * Se corre a mano desde Nómina > Bonos antes del corte — no hay un cron
 * automático en V1.
 */
export async function generarBonosPendientes(periodoInicio: FechaISO, periodoFin: FechaISO, hoy: FechaISO): Promise<number> {
  const bonosActivos = await prisma.bonoConfig.findMany({ where: { activo: true } });
  const personasDestajo = await prisma.personal.findMany({ where: { tipo: "destajo", activo: true } });

  let generados = 0;
  for (const bono of bonosActivos) {
    for (const persona of personasDestajo) {
      const monto = await calcularBonoParaPersona(bono.id, persona.id, hoy);
      if (monto <= 0) continue;

      const existente = await prisma.bonoOtorgado.findFirst({
        where: { bonoConfigId: bono.id, personalId: persona.id, periodoInicio: new Date(periodoInicio), periodoFin: new Date(periodoFin) },
      });
      if (existente) continue;

      await prisma.bonoOtorgado.create({
        data: {
          bonoConfigId: bono.id,
          personalId: persona.id,
          periodoInicio: new Date(periodoInicio),
          periodoFin: new Date(periodoFin),
          montoCalculado: monto,
        },
      });
      generados++;
    }
  }
  return generados;
}

export async function autorizarBono(id: string, autorizadoPorId: string) {
  return prisma.bonoOtorgado.update({ where: { id }, data: { estado: "autorizado", autorizadoPorId } });
}

export async function rechazarBono(id: string, autorizadoPorId: string) {
  return prisma.bonoOtorgado.update({ where: { id }, data: { estado: "rechazado", autorizadoPorId } });
}

/** Solo bonos ya autorizados cuentan para el "neto a pagar" del reporte semanal. */
export async function totalBonosAutorizadosPersonaEnPeriodo(personalId: string, periodoInicio: FechaISO, periodoFin: FechaISO): Promise<number> {
  const bonos = await prisma.bonoOtorgado.findMany({
    where: { personalId, periodoInicio: new Date(periodoInicio), periodoFin: new Date(periodoFin), estado: "autorizado" },
  });
  return bonos.reduce((s, b) => s + Number(b.montoCalculado), 0);
}
