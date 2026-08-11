import { estadoPlazo, type EstadoPlazo, type FechaISO } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";
import { diaEstaCerrado, huertasEnAlcance, obtenerCapturaDelDia } from "./captura.js";
import { miembrosDeGrupoEnFecha } from "./grupos.js";

function hoyISO(): FechaISO {
  return new Date().toISOString().slice(0, 10);
}

export async function estadoPlazoDeFecha(fecha: FechaISO): Promise<EstadoPlazo> {
  const { diasGraciaCierre } = await obtenerConfigNomina();
  return estadoPlazo(fecha, hoyISO(), diasGraciaCierre);
}

/** Fechas con registros manuales en la Huerta que todavía no se han cerrado, con su estado de plazo. */
export async function diasPendientesDeCierre(huertaId: string) {
  const registros = await prisma.registroNomina.findMany({
    where: { huertaId, origen: "manual" },
    select: { fecha: true },
    distinct: ["fecha"],
  });
  const cierres = await prisma.diaCerrado.findMany({ where: { huertaId }, select: { fecha: true } });
  const cerradas = new Set(cierres.map((c) => c.fecha.toISOString().slice(0, 10)));

  const pendientes = registros.map((r) => r.fecha.toISOString().slice(0, 10)).filter((f) => !cerradas.has(f));

  return Promise.all(pendientes.map(async (fecha) => ({ fecha, estado: await estadoPlazoDeFecha(fecha) })));
}

export class CierreVencidoRequiereAutorizacionError extends Error {
  constructor() {
    super("El plazo de gracia para cerrar este día ya venció — solo Directivo/Gerencia puede cerrarlo ahora.");
  }
}

export async function cerrarDia(huertaId: string, fecha: FechaISO, cerradoPorId: string, puedeForzarVencido: boolean): Promise<void> {
  const estado = await estadoPlazoDeFecha(fecha);
  if (estado === "vencido" && !puedeForzarVencido) throw new CierreVencidoRequiereAutorizacionError();

  await prisma.diaCerrado.upsert({
    where: { huertaId_fecha: { huertaId, fecha: new Date(fecha) } },
    update: {},
    create: { huertaId, fecha: new Date(fecha), cerradoPorId },
  });
}

export async function reabrirDia(huertaId: string, fecha: FechaISO): Promise<void> {
  await prisma.diaCerrado.deleteMany({ where: { huertaId, fecha: new Date(fecha) } });
}

/** Listado navegable de días ya cerrados (9.11) — para que Directivo/RH/Nóminas/Gerencia Admva. puedan entrar a corregir. */
export async function diasCerrados(huertaId: string) {
  const cierres = await prisma.diaCerrado.findMany({ where: { huertaId }, orderBy: { fecha: "desc" } });
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: [...new Set(cierres.map((c) => c.cerradoPorId))] } },
    select: { id: true, nombre: true },
  });
  const nombrePorId = new Map(usuarios.map((u) => [u.id, u.nombre]));
  return cierres.map((c) => ({
    fecha: c.fecha.toISOString().slice(0, 10),
    cerradoPorNombre: nombrePorId.get(c.cerradoPorId) ?? "—",
  }));
}

export interface ResumenCierreHuerta {
  huerta: { id: string; nombre: string };
  cantidadPersonas: number;
  totalActividades: number;
  totalBruto: number;
  cerrado: boolean;
  estadoPlazo: EstadoPlazo;
}

/**
 * Paso 1 — Resumen (9.11): una tarjeta por Rancho con cantidad de personas,
 * total de actividades y total a pagar BRUTO (sin descuento de préstamo —
 * eso solo se ve en Reporte semanal, gated a Gerencia/Directivo). Solo
 * incluye Ranchos que tengan algo capturado ese día.
 */
export async function resumenCierreTodasUPs(fecha: FechaISO, huertaIdAlcance: string | null): Promise<ResumenCierreHuerta[]> {
  const huertas = await huertasEnAlcance(huertaIdAlcance);
  const estadoPlazoDia = await estadoPlazoDeFecha(fecha);

  const resultados: ResumenCierreHuerta[] = [];
  for (const huerta of huertas) {
    const registros = await obtenerCapturaDelDia(huerta.id, fecha);
    if (registros.length === 0) continue;

    const personas = new Set<string>();
    for (const r of registros) {
      if (r.personalId) personas.add(r.personalId);
      else if (r.grupoId) {
        const miembros = await miembrosDeGrupoEnFecha(r.grupoId, fecha);
        miembros.forEach((id) => personas.add(id));
      }
    }
    const totalBruto = registros.reduce((s, r) => s + Number(r.cantidad) * Number(r.tarifaAplicada), 0);
    const cerrado = await diaEstaCerrado(huerta.id, fecha);

    resultados.push({
      huerta: { id: huerta.id, nombre: huerta.nombre },
      cantidadPersonas: personas.size,
      totalActividades: registros.length,
      totalBruto,
      cerrado,
      estadoPlazo: estadoPlazoDia,
    });
  }
  return resultados;
}
