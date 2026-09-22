import {
  calcularBonoAsistenciaSemanal,
  calcularPeriodoNomina,
  evaluarDiaAsistencia,
  MONTO_BONO_ASISTENCIA_DEFAULT,
  MONTO_BONO_ASISTENCIA_ESPECIAL,
  semanaBonoDePeriodoNomina,
  type EvaluacionDia,
  type FechaISO,
  type ResultadoBonoAsistencia,
  type SemanaBono,
} from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";
import { SemanaConfirmadaError } from "./semana-confirmada.js";

/**
 * Bono de Asistencia Semanal (V1 P7, 21-sep-2026). Diseñado 14-sep-2026 a
 * partir del Google Sheets real de la empresa (ver documento vivo, 9.11
 * Nómina -> Bonos). Solo CBF: el 100% de cada bono se atribuye a CBF, sin
 * repartición con Tres Marini (pendiente). Sin "Compromisos especiales" ni
 * Matriz de Asistencia (pendientes). Cálculo siempre en vivo -- no hay paso
 * de "recalcular" -- hasta que se cierra la semana en Reporte Semanal, que
 * congela los números (ver congelarBonosAsistencia).
 */

const CLAVE_MONTO_DEFAULT = "bono_asistencia_monto_default";
const CLAVE_MONTO_ESPECIAL = "bono_asistencia_monto_especial";

export interface ConfigMontosBonoAsistencia {
  montoDefault: number;
  montoEspecial: number;
}

export async function obtenerMontosBonoAsistencia(): Promise<ConfigMontosBonoAsistencia> {
  const filas = await prisma.configNomina.findMany({ where: { clave: { in: [CLAVE_MONTO_DEFAULT, CLAVE_MONTO_ESPECIAL] } } });
  const mapa = new Map(filas.map((f) => [f.clave, Number(f.valor)]));
  return {
    montoDefault: mapa.get(CLAVE_MONTO_DEFAULT) ?? MONTO_BONO_ASISTENCIA_DEFAULT,
    montoEspecial: mapa.get(CLAVE_MONTO_ESPECIAL) ?? MONTO_BONO_ASISTENCIA_ESPECIAL,
  };
}

export async function actualizarMontosBonoAsistencia(input: Partial<ConfigMontosBonoAsistencia>): Promise<void> {
  const upsert = (clave: string, valor: number) =>
    prisma.configNomina.upsert({ where: { clave }, update: { valor: String(valor) }, create: { clave, valor: String(valor) } });
  if (input.montoDefault !== undefined) await upsert(CLAVE_MONTO_DEFAULT, input.montoDefault);
  if (input.montoEspecial !== undefined) await upsert(CLAVE_MONTO_ESPECIAL, input.montoEspecial);
}

export interface FilaBonoAsistencia {
  personalId: string;
  nombreCompleto: string;
  resultado: ResultadoBonoAsistencia;
  congelado: boolean;
}

export interface ResumenBonoAsistencia {
  /** Semana de Nómina (Vie a Jue) que se está cerrando. */
  periodoNomina: { inicio: FechaISO; fin: FechaISO };
  /** Semana de asistencia evaluada (Lun a Sáb). */
  semanaBono: SemanaBono;
  congelada: boolean;
  filas: FilaBonoAsistencia[];
}

/** Semana de asistencia del bono que corresponde a la semana de Nómina que contiene `hoy`. */
export async function semanaDelBonoParaHoy(hoy: FechaISO): Promise<{ periodo: { inicio: FechaISO; fin: FechaISO }; semana: SemanaBono }> {
  const config = await obtenerConfigNomina();
  const periodo = calcularPeriodoNomina(hoy, config.diaCorteIndex);
  return { periodo: { inicio: periodo.inicio, fin: periodo.fin }, semana: semanaBonoDePeriodoNomina(periodo.inicio) };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Evalúa a las personas que tuvieron actividad (o un Ajuste de Asistencia)
 * en la semana de asistencia. Una persona es un registro único del catálogo
 * de Personal -- nunca se compara texto libre.
 */
export async function evaluarBonoAsistenciaSemana(semana: SemanaBono): Promise<Omit<FilaBonoAsistencia, "congelado">[]> {
  const desde = new Date(semana.inicio);
  const hasta = new Date(semana.fin);
  const montos = await obtenerMontosBonoAsistencia();

  // Registros de la semana, individuales y grupales (los miembros de un
  // Grupo de Pago cuentan como destajo de ese día, igual que en fechasConActividad de bonos.ts).
  const registros = await prisma.registroNomina.findMany({
    where: { fecha: { gte: desde, lte: hasta } },
    include: { actividad: true, grupo: { include: { miembros: true } } },
  });
  const ajustes = await prisma.bonoAsistenciaAjuste.findMany({ where: { fecha: { gte: desde, lte: hasta } } });

  const porPersonaDia = new Map<string, { hayRegistro: boolean; tieneDestajo: boolean; horas: number }>();
  const tocar = (personalId: string, fecha: string) => {
    const k = `${personalId}|${fecha}`;
    let v = porPersonaDia.get(k);
    if (!v) porPersonaDia.set(k, (v = { hayRegistro: false, tieneDestajo: false, horas: 0 }));
    return v;
  };
  const candidatos = new Set<string>();
  for (const r of registros) {
    const fecha = iso(r.fecha);
    const esHoras = r.actividad.esquemaPago === "individual_hora";
    const personas = r.personalId ? [r.personalId] : (r.grupo?.miembros ?? []).map((m) => m.personalId);
    for (const p of personas) {
      candidatos.add(p);
      const v = tocar(p, fecha);
      v.hayRegistro = true;
      if (esHoras) v.horas += Number(r.cantidad);
      else v.tieneDestajo = true; // pagada por pieza (caja/remolque/empacadores), sin horas
    }
  }
  const ajustePorPersonaDia = new Map(ajustes.map((a) => [`${a.personalId}|${iso(a.fecha)}`, a]));
  for (const a of ajustes) candidatos.add(a.personalId);

  const personal = await prisma.personal.findMany({ where: { id: { in: [...candidatos] }, activo: true } });
  const filas: Omit<FilaBonoAsistencia, "congelado">[] = [];
  for (const persona of personal) {
    const dias: EvaluacionDia[] = semana.dias.map((fecha) => {
      const v = porPersonaDia.get(`${persona.id}|${fecha}`);
      const aj = ajustePorPersonaDia.get(`${persona.id}|${fecha}`);
      return evaluarDiaAsistencia({
        fecha,
        medioTiempo: persona.bonoAsistenciaMedioTiempo,
        hayRegistro: v?.hayRegistro ?? false,
        tieneDestajo: v?.tieneDestajo ?? false,
        horas: v?.horas ?? 0,
        ajuste: aj ? { diaCompleto: aj.diaCompleto, justificado: aj.justificado } : null,
      });
    });
    const resultado = calcularBonoAsistenciaSemanal({
      config: { nunca: persona.bonoAsistenciaNunca, montoEspecial: persona.bonoAsistenciaMontoEspecial, medioTiempo: persona.bonoAsistenciaMedioTiempo },
      dias,
      montoDefault: montos.montoDefault,
      montoEspecial: montos.montoEspecial,
    });
    filas.push({ personalId: persona.id, nombreCompleto: persona.nombreCompleto, resultado });
  }
  return filas.sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, "es"));
}

/**
 * Resumen del bono para la semana de Nómina que contiene `hoy`. Si esa
 * semana ya se cerró, regresa lo congelado (no se recalcula); si no, en vivo.
 */
export async function resumenBonoAsistencia(hoy: FechaISO): Promise<ResumenBonoAsistencia> {
  const { periodo, semana } = await semanaDelBonoParaHoy(hoy);
  const congelados = await prisma.bonoAsistenciaCongelado.findMany({
    where: { semanaNominaFin: new Date(periodo.fin) },
    include: { personal: true },
  });
  if (congelados.length > 0) {
    return {
      periodoNomina: periodo,
      semanaBono: semana,
      congelada: true,
      filas: congelados
        .map((c) => ({
          personalId: c.personalId,
          nombreCompleto: c.personal.nombreCompleto,
          congelado: true,
          resultado: {
            monto: Number(c.monto),
            cumple: c.cumple,
            motivoSinBono: (c.motivoSinBono as ResultadoBonoAsistencia["motivoSinBono"]) ?? null,
            dias: c.detalleDias as unknown as EvaluacionDia[],
          },
        }))
        .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, "es")),
    };
  }
  const filas = (await evaluarBonoAsistenciaSemana(semana)).map((f) => ({ ...f, congelado: false }));
  return { periodoNomina: periodo, semanaBono: semana, congelada: false, filas };
}

/** Monto del bono de UNA persona en la semana de Nómina de `hoy` (0 si no aplica) — para el Reporte Semanal. */
export function montosBonoPorPersona(resumen: ResumenBonoAsistencia): Map<string, number> {
  return new Map(resumen.filas.filter((f) => f.resultado.monto > 0).map((f) => [f.personalId, f.resultado.monto]));
}

/**
 * Congela el bono de la semana al cerrarla en Reporte Semanal (igual que el
 * pago normal): guarda una foto de cada persona evaluada, con el detalle
 * por día, para que ya no cambie aunque después se edite una captura.
 */
export async function congelarBonosAsistencia(hoy: FechaISO, congeladoPorId: string): Promise<number> {
  const { periodo, semana } = await semanaDelBonoParaHoy(hoy);
  const filas = await evaluarBonoAsistenciaSemana(semana);
  for (const f of filas) {
    await prisma.bonoAsistenciaCongelado.upsert({
      where: { personalId_semanaNominaFin: { personalId: f.personalId, semanaNominaFin: new Date(periodo.fin) } },
      update: {},
      create: {
        personalId: f.personalId,
        semanaNominaFin: new Date(periodo.fin),
        bonoInicio: new Date(semana.inicio),
        bonoFin: new Date(semana.fin),
        monto: f.resultado.monto,
        cumple: f.resultado.cumple,
        motivoSinBono: f.resultado.motivoSinBono,
        detalleDias: f.resultado.dias as unknown as object,
        congeladoPorId,
      },
    });
  }
  return filas.length;
}

// ---- Ajustes de Asistencia ----

export interface AjusteAsistenciaInput {
  personalId: string;
  fecha: FechaISO;
  diaCompleto: boolean;
  justificado: boolean;
  nota?: string;
}

/** Una fila por Persona + Fecha exacta: capturar otra vez esa fecha la reemplaza. */
/** Candado permanente: si la semana de asistencia de esa fecha ya se congeló al cerrar Nómina, no se editan Ajustes. */
export async function verificarAjusteEditable(fecha: FechaISO): Promise<void> {
  const congelado = await prisma.bonoAsistenciaCongelado.findFirst({ where: { bonoInicio: { lte: new Date(fecha) }, bonoFin: { gte: new Date(fecha) } } });
  if (congelado) throw new SemanaConfirmadaError(iso(congelado.semanaNominaFin));
}

export async function guardarAjusteAsistencia(input: AjusteAsistenciaInput, capturadoPorId: string) {
  await verificarAjusteEditable(input.fecha);
  return prisma.bonoAsistenciaAjuste.upsert({
    where: { personalId_fecha: { personalId: input.personalId, fecha: new Date(input.fecha) } },
    update: { diaCompleto: input.diaCompleto, justificado: input.justificado, nota: input.nota ?? null, capturadoPorId },
    create: { personalId: input.personalId, fecha: new Date(input.fecha), diaCompleto: input.diaCompleto, justificado: input.justificado, nota: input.nota, capturadoPorId },
  });
}

export function listarAjustesAsistencia(desde: FechaISO, hasta: FechaISO) {
  return prisma.bonoAsistenciaAjuste.findMany({
    where: { fecha: { gte: new Date(desde), lte: new Date(hasta) } },
    include: { personal: { select: { id: true, nombreCompleto: true, huertaId: true } } },
    orderBy: [{ fecha: "desc" }, { fechaCaptura: "desc" }],
  });
}

// ---- Configuración por persona ----

export interface ConfigPersonaBono {
  bonoAsistenciaNunca?: boolean;
  bonoAsistenciaMedioTiempo?: boolean;
  bonoAsistenciaMontoEspecial?: boolean;
}

/**
 * Ids de personas con al menos una asistencia (registro directo, vía
 * miembro de Grupo de Pago, o un Ajuste de Asistencia) dentro de la
 * semana -- mismo criterio "candidatos" que evaluarBonoAsistenciaSemana,
 * factorizado aparte para no volver a calcular el detalle día por día
 * cuando solo hace falta saber quién estuvo (pedido por Diego, 21-sep-2026:
 * la lista de Configuración no debe mostrar a quien no vino en toda la semana).
 */
export async function personasConAsistenciaEnSemana(semana: SemanaBono): Promise<Set<string>> {
  const desde = new Date(semana.inicio);
  const hasta = new Date(semana.fin);
  const [registros, ajustes] = await Promise.all([
    prisma.registroNomina.findMany({
      where: { fecha: { gte: desde, lte: hasta } },
      select: { personalId: true, grupo: { select: { miembros: { select: { personalId: true } } } } },
    }),
    prisma.bonoAsistenciaAjuste.findMany({ where: { fecha: { gte: desde, lte: hasta } }, select: { personalId: true } }),
  ]);
  const candidatos = new Set<string>();
  for (const r of registros) {
    if (r.personalId) candidatos.add(r.personalId);
    for (const m of r.grupo?.miembros ?? []) candidatos.add(m.personalId);
  }
  for (const a of ajustes) candidatos.add(a.personalId);
  return candidatos;
}

export async function listarConfigPersonasBono(semana: SemanaBono) {
  const candidatos = await personasConAsistenciaEnSemana(semana);
  return prisma.personal.findMany({
    where: { activo: true, id: { in: [...candidatos] } },
    select: { id: true, nombreCompleto: true, tipo: true, bonoAsistenciaNunca: true, bonoAsistenciaMedioTiempo: true, bonoAsistenciaMontoEspecial: true },
    orderBy: { nombreCompleto: "asc" },
  });
}

export function actualizarConfigPersonaBono(personalId: string, input: ConfigPersonaBono) {
  return prisma.personal.update({ where: { id: personalId }, data: input, select: { id: true, bonoAsistenciaNunca: true, bonoAsistenciaMedioTiempo: true, bonoAsistenciaMontoEspecial: true } });
}
