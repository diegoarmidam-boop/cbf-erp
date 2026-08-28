import { prisma } from "../../core/db.js";

export function listarConceptos(equipoId: string) {
  return prisma.mantenimientoConcepto.findMany({ where: { equipoId }, orderBy: { nombre: "asc" } });
}

export function crearConcepto(equipoId: string, nombre: string, umbralHoras: number) {
  return prisma.mantenimientoConcepto.create({ data: { equipoId, nombre, umbralHoras } });
}

export function listarEventos(equipoId: string) {
  return prisma.mantenimientoEvento.findMany({ where: { equipoId }, include: { concepto: true }, orderBy: { fecha: "desc" } });
}

export interface EventoInput {
  tipo: "preventivo" | "correctivo";
  conceptoId?: string;
  descripcion: string;
  mecanicoInterno: boolean;
  costo?: number;
  fecha: string;
}

export function registrarEvento(equipoId: string, input: EventoInput) {
  return prisma.mantenimientoEvento.create({
    data: {
      equipoId,
      tipo: input.tipo,
      conceptoId: input.conceptoId,
      descripcion: input.descripcion,
      mecanicoInterno: input.mecanicoInterno,
      costo: input.costo,
      fecha: new Date(input.fecha),
    },
  });
}

export interface AlertaMantenimiento {
  conceptoId: string;
  nombre: string;
  umbralHoras: number;
  horasAcumuladasDesdeUltimoServicio: number;
  vencido: boolean;
}

/**
 * Esquema preventivo configurable por umbral de horas (9.13) — las horas se
 * toman del horómetro acumulado en cargas de combustible desde el último
 * evento de ese concepto (o desde siempre, si nunca se ha hecho).
 */
export async function alertasMantenimiento(equipoId: string): Promise<AlertaMantenimiento[]> {
  const conceptos = await prisma.mantenimientoConcepto.findMany({ where: { equipoId } });
  // Mismo desempate que calcularAlertaRendimiento: varias cargas el mismo
  // día son comunes, y el horómetro (monotónico creciente) reconstruye el
  // orden cronológico real donde "fecha" sola no alcanza.
  const cargas = await prisma.combustibleCarga.findMany({
    where: { equipoId, horometro: { not: null } },
    orderBy: [{ fecha: "asc" }, { horometro: "asc" }],
  });
  const horometroActual = cargas.length ? Number(cargas[cargas.length - 1]!.horometro) : 0;

  const resultado: AlertaMantenimiento[] = [];
  for (const concepto of conceptos) {
    const ultimoEvento = await prisma.mantenimientoEvento.findFirst({
      where: { equipoId, conceptoId: concepto.id },
      orderBy: { fecha: "desc" },
    });
    let horometroUltimoServicio = 0;
    if (ultimoEvento) {
      const cargaEnEsaFecha = cargas.filter((c) => c.fecha <= ultimoEvento.fecha).at(-1);
      horometroUltimoServicio = cargaEnEsaFecha ? Number(cargaEnEsaFecha.horometro) : 0;
    }
    const horasAcumuladasDesdeUltimoServicio = horometroActual - horometroUltimoServicio;
    resultado.push({
      conceptoId: concepto.id,
      nombre: concepto.nombre,
      umbralHoras: Number(concepto.umbralHoras),
      horasAcumuladasDesdeUltimoServicio,
      vencido: horasAcumuladasDesdeUltimoServicio >= Number(concepto.umbralHoras),
    });
  }
  return resultado;
}
