import { prisma } from "../../core/db.js";
import { registrarConsumoMaquinaria } from "../almacen/movimientos.js";

export class OdometroRetrocedeError extends Error {
  constructor(campo: "odometro" | "horometro", anterior: number, nuevo: number) {
    super(`El ${campo} nuevo (${nuevo}) no puede ser menor al último registrado (${anterior}) — nunca debe bajar.`);
  }
}

export interface CargaInput {
  fecha: string;
  tipo: "diesel_garrafa" | "gasolina_externa" | "diesel_externo";
  odometro?: number;
  horometro?: number;
  litros: number;
  precioUnitario?: number;
  productoId?: string; // requerido si tipo=diesel_garrafa — de qué producto de Almacén sale
}

async function validarNoRetrocede(equipoId: string, campo: "odometro" | "horometro", nuevo: number | undefined): Promise<void> {
  if (nuevo == null) return;
  const ultima = await prisma.combustibleCarga.findFirst({
    where: { equipoId, [campo]: { not: null } },
    orderBy: { fecha: "desc" },
  });
  const anterior = ultima ? Number(ultima[campo]) : null;
  if (anterior != null && nuevo < anterior) throw new OdometroRetrocedeError(campo, anterior, nuevo);
}

export async function registrarCarga(equipoId: string, input: CargaInput, capturadoPorId: string) {
  // Validación dura (9.13): bloquea, no solo alerta.
  await validarNoRetrocede(equipoId, "odometro", input.odometro);
  await validarNoRetrocede(equipoId, "horometro", input.horometro);

  if (input.tipo === "diesel_garrafa" && !input.productoId) {
    throw new Error("Falta el producto de Almacén del que sale el diésel de garrafa.");
  }

  return prisma.$transaction(async (tx) => {
    const carga = await tx.combustibleCarga.create({
      data: {
        equipoId,
        fecha: new Date(input.fecha),
        tipo: input.tipo,
        odometro: input.odometro,
        horometro: input.horometro,
        litros: input.litros,
        precioUnitario: input.precioUnitario,
        capturadoPorId,
      },
    });
    if (input.tipo === "diesel_garrafa" && input.productoId) {
      await registrarConsumoMaquinaria(input.productoId, input.litros, equipoId, capturadoPorId);
    }
    return carga;
  });
}

export function historialCargas(equipoId: string) {
  return prisma.combustibleCarga.findMany({ where: { equipoId }, orderBy: { fecha: "desc" } });
}

export interface AlertaRendimiento {
  tasaActual: number;
  promedioHistorico: number;
  unidad: "L/hora" | "km/L";
  desviacionPorcentual: number;
  anomalo: boolean;
}

const UMBRAL_DESVIACION = 0.3; // 30% fuera del promedio histórico propio del equipo — sin un umbral exacto del documento, es un default razonable

/**
 * Alerta de consumo anómalo (9.13): tractores por litros/hora, camionetas
 * por km/litro — siempre contra el histórico PROPIO de ese equipo, nunca
 * comparado entre equipos distintos.
 */
export async function calcularAlertaRendimiento(equipoId: string): Promise<AlertaRendimiento | null> {
  const equipo = await prisma.equipo.findUniqueOrThrow({ where: { id: equipoId } });
  const esTractor = equipo.tipo === "tractor";
  // "fecha" es solo la fecha (sin hora) — varias cargas el mismo día son
  // comunes, así que se necesita un desempate. odómetro/horómetro son
  // monotónicos crecientes por la validación dura de registrarCarga, así
  // que ordenar por ese campo reconstruye el orden cronológico real.
  const cargas = await prisma.combustibleCarga.findMany({
    where: { equipoId },
    orderBy: esTractor ? [{ fecha: "asc" }, { horometro: "asc" }] : [{ fecha: "asc" }, { odometro: "asc" }],
  });
  if (cargas.length < 2) return null;
  const tasas: number[] = [];
  for (let i = 1; i < cargas.length; i++) {
    const anterior = cargas[i - 1]!;
    const actual = cargas[i]!;
    if (esTractor && actual.horometro != null && anterior.horometro != null) {
      const horas = Number(actual.horometro) - Number(anterior.horometro);
      if (horas > 0) tasas.push(Number(actual.litros) / horas);
    } else if (!esTractor && actual.odometro != null && anterior.odometro != null) {
      const km = Number(actual.odometro) - Number(anterior.odometro);
      if (km > 0 && Number(actual.litros) > 0) tasas.push(km / Number(actual.litros));
    }
  }
  if (tasas.length < 2) return null;

  const tasaActual = tasas[tasas.length - 1]!;
  const historicas = tasas.slice(0, -1);
  const promedioHistorico = historicas.reduce((s, t) => s + t, 0) / historicas.length;
  const desviacionPorcentual = promedioHistorico > 0 ? (tasaActual - promedioHistorico) / promedioHistorico : 0;

  return {
    tasaActual,
    promedioHistorico,
    unidad: esTractor ? "L/hora" : "km/L",
    desviacionPorcentual,
    anomalo: Math.abs(desviacionPorcentual) > UMBRAL_DESVIACION,
  };
}
