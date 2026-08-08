import { estadoPlazo, type EstadoPlazo, type FechaISO } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";

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
