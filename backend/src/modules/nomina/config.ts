import { diaIndexDesdeNombre } from "@cbf/shared";
import { prisma } from "../../core/db.js";

export interface ConfigNominaResuelta {
  diaCorteSemanal: string;
  diaCorteIndex: number;
  diasGraciaCierre: number;
  tarifaGeneralHora: number | null;
}

export async function obtenerConfigNomina(): Promise<ConfigNominaResuelta> {
  const filas = await prisma.configNomina.findMany();
  const mapa = new Map(filas.map((f) => [f.clave, f.valor]));

  const diaCorteSemanal = mapa.get("dia_corte_semanal") ?? "jueves";
  const diasGraciaCierre = Number(mapa.get("dias_gracia_cierre") ?? "3");
  const tarifaRaw = mapa.get("tarifa_general_hora");

  return {
    diaCorteSemanal,
    diaCorteIndex: diaIndexDesdeNombre(diaCorteSemanal),
    diasGraciaCierre,
    tarifaGeneralHora: tarifaRaw != null ? Number(tarifaRaw) : null,
  };
}

export async function actualizarConfigNomina(input: {
  diaCorteSemanal?: string;
  diasGraciaCierre?: number;
  tarifaGeneralHora?: number;
}): Promise<void> {
  const escrituras: Promise<unknown>[] = [];
  if (input.diaCorteSemanal !== undefined) {
    diaIndexDesdeNombre(input.diaCorteSemanal); // valida
    escrituras.push(
      prisma.configNomina.upsert({
        where: { clave: "dia_corte_semanal" },
        update: { valor: input.diaCorteSemanal },
        create: { clave: "dia_corte_semanal", valor: input.diaCorteSemanal },
      })
    );
  }
  if (input.diasGraciaCierre !== undefined) {
    escrituras.push(
      prisma.configNomina.upsert({
        where: { clave: "dias_gracia_cierre" },
        update: { valor: String(input.diasGraciaCierre) },
        create: { clave: "dias_gracia_cierre", valor: String(input.diasGraciaCierre) },
      })
    );
  }
  if (input.tarifaGeneralHora !== undefined) {
    escrituras.push(
      prisma.configNomina.upsert({
        where: { clave: "tarifa_general_hora" },
        update: { valor: String(input.tarifaGeneralHora) },
        create: { clave: "tarifa_general_hora", valor: String(input.tarifaGeneralHora) },
      })
    );
  }
  await Promise.all(escrituras);
}
