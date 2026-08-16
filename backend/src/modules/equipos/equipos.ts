import { prisma } from "../../core/db.js";

export type TipoEquipo = "tractor" | "camioneta" | "remolque" | "implemento";

/** AF (Activo Fijo) para tractores/camionetas/remolques, IA (Implemento Agrícola) para implementos (9.13). */
export function prefijoFolio(tipo: TipoEquipo): "AF" | "IA" {
  return tipo === "implemento" ? "IA" : "AF";
}

/** Sugerencia del siguiente folio disponible para esa serie — editable antes de guardar. */
export async function sugerirFolio(tipo: TipoEquipo): Promise<string> {
  const prefijo = prefijoFolio(tipo);
  const equipos = await prisma.equipo.findMany({ where: { folio: { startsWith: `${prefijo}-` } }, select: { folio: true } });
  const numeros = equipos.map((e) => Number(e.folio.split("-")[1])).filter((n) => Number.isFinite(n));
  const siguiente = (numeros.length ? Math.max(...numeros) : 0) + 1;
  return `${prefijo}-${String(siguiente).padStart(3, "0")}`;
}

export function listarEquipos(tipo?: TipoEquipo) {
  return prisma.equipo.findMany({ where: { activo: true, tipo }, orderBy: { folio: "asc" } });
}

export interface AltaEquipoInput {
  tipo: TipoEquipo;
  folio: string;
  marca?: string;
  modelo?: string;
  anio?: number;
  placas?: string;
  operadorDesignadoId?: string;
}

export async function crearEquipo(input: AltaEquipoInput) {
  const prefijoEsperado = prefijoFolio(input.tipo);
  if (!input.folio.startsWith(`${prefijoEsperado}-`)) {
    throw new Error(`El folio de un(a) ${input.tipo} debe empezar con "${prefijoEsperado}-".`);
  }
  return prisma.equipo.create({ data: input });
}

export interface EditarEquipoInput {
  marca?: string;
  modelo?: string;
  anio?: number;
  placas?: string;
  operadorDesignadoId?: string | null;
}

export function editarEquipo(id: string, input: EditarEquipoInput) {
  // tipo y folio no se editan aquí — cambiar de serie (AF/IA) o de folio
  // formalmente es dar de baja y alta de nuevo, no una corrección de datos.
  return prisma.equipo.update({ where: { id }, data: input });
}
