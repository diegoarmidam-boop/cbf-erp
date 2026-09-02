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
    }
  );
}

export async function actualizarEmpresaConfig(input: EmpresaConfigInput) {
  return prisma.empresaConfig.upsert({
    where: { id: ID_SINGLETON },
    create: { id: ID_SINGLETON, ...input },
    update: input,
  });
}
