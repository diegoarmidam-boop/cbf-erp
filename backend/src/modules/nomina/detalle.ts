import { totalRegistro, totalRegistroGrupalPorPersona, type FechaISO } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";
import { miembrosDeGrupoEnFecha } from "./grupos.js";
import { aActividadCalc } from "./util.js";

export interface LineaDetalleActividad {
  fecha: FechaISO;
  actividad: string;
  cantidad: number;
  monto: number;
}

/** Desglose día por día de lo que ganó una persona por actividad — para el exportable "sobre". */
export async function detalleActividadesPersonaEnPeriodo(
  personalId: string,
  fechaIni: FechaISO,
  fechaFin: FechaISO
): Promise<LineaDetalleActividad[]> {
  const registros = await prisma.registroNomina.findMany({
    where: {
      fecha: { gte: new Date(fechaIni), lte: new Date(fechaFin) },
      OR: [{ personalId }, { grupo: { miembros: { some: { personalId } } } }],
    },
    include: { actividad: true },
    orderBy: { fecha: "asc" },
  });

  const config = await obtenerConfigNomina();
  const lineas: LineaDetalleActividad[] = [];
  for (const r of registros) {
    const montoTotal = totalRegistro(Number(r.cantidad), aActividadCalc(r.actividad), config.tarifaGeneralHora);
    const fecha = r.fecha.toISOString().slice(0, 10);
    if (r.personalId === personalId) {
      lineas.push({ fecha, actividad: r.actividad.nombre, cantidad: Number(r.cantidad), monto: montoTotal });
    } else if (r.grupoId) {
      const miembros = await miembrosDeGrupoEnFecha(r.grupoId, fecha);
      if (!miembros.includes(personalId)) continue;
      lineas.push({
        fecha,
        actividad: `${r.actividad.nombre} (grupo, ${miembros.length} personas)`,
        cantidad: Number(r.cantidad),
        monto: totalRegistroGrupalPorPersona(montoTotal, miembros.length),
      });
    }
  }
  return lineas;
}
