import { prisma } from "../../core/db.js";

// Configuración del sistema (2-sep-2026, 9.14): datos de facturación de la
// empresa y firmas de Orden de Compra — fila única, reutilizable por
// cualquier documento futuro que los necesite (no solo la Orden de Compra).
const ID_SINGLETON = "singleton";

export interface EmpresaConfigInput {
  razonSocial?: string | null;
  rfc?: string | null;
  domicilioFiscal?: string | null;
  telefono?: string | null;
  firmaAtiendeNombre?: string | null;
  firmaAutorizaNombre?: string | null;
  umbralExcedentePctDefault?: number;
  umbralDesviacionCombustiblePctDefault?: number;
}

export async function obtenerEmpresaConfig() {
  const config = await prisma.empresaConfig.findUnique({ where: { id: ID_SINGLETON } });
  return (
    config ?? {
      id: ID_SINGLETON,
      razonSocial: null,
      rfc: null,
      domicilioFiscal: null,
      telefono: null,
      firmaAtiendeNombre: null,
      firmaAutorizaNombre: null,
      umbralExcedentePctDefault: 20,
      umbralDesviacionCombustiblePctDefault: 20,
    }
  );
}

/** Umbral global de % Excedente del Comparador (Prioridad 2, V35) -- usado como default al crear una Comparación nueva. */
export async function obtenerUmbralExcedenteDefault(): Promise<number> {
  const config = await obtenerEmpresaConfig();
  return Number(config.umbralExcedentePctDefault ?? 20);
}

/** % de desviación contra el promedio histórico propio de un Equipo que dispara la alerta de consumo anómalo (V1 P3, 26-sep-2026, 9.13f) — reemplaza el UMBRAL_DESVIACION fijo. */
export async function obtenerUmbralDesviacionCombustible(): Promise<number> {
  const config = await obtenerEmpresaConfig();
  return Number(config.umbralDesviacionCombustiblePctDefault ?? 20) / 100;
}

export async function actualizarEmpresaConfig(input: EmpresaConfigInput) {
  return prisma.empresaConfig.upsert({
    where: { id: ID_SINGLETON },
    create: { id: ID_SINGLETON, ...input },
    update: input,
  });
}
