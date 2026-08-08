import type { Prisma } from "@prisma/client";
import type { TransactionClient } from "./db.js";

type Activador = (tx: TransactionClient, solicitud: { payload: Prisma.JsonValue; entidadId: string | null }) => Promise<void>;

// Qué hacer al autorizar cada tipo de solicitud — se registra aquí en vez de
// en core/solicitudes.routes.ts para que cada módulo pueda ir agregando el
// suyo sin que este archivo central conozca los detalles de cada uno.
// Se completa conforme se construye cada módulo (RH, Almacén, Compras...).
export const activadoresSolicitud: Record<string, Activador> = {
  actividad_alta: async (tx, solicitud) => {
    const datos = solicitud.payload as {
      nombre: string;
      unidad: string;
      tarifa: number;
      usarTarifaGeneral: boolean;
      esquemaPago: "individual_hora" | "individual_caja" | "grupal_remolque" | "depende_empacadores";
      requiereCuadro: boolean;
    };
    await tx.actividad.create({ data: datos });
  },
  actividad_tarifa: async (tx, solicitud) => {
    if (!solicitud.entidadId) throw new Error("Solicitud de cambio de tarifa sin entidadId.");
    const { tarifa, usarTarifaGeneral } = solicitud.payload as { tarifa: number; usarTarifaGeneral: boolean };
    await tx.actividad.update({ where: { id: solicitud.entidadId }, data: { tarifa, usarTarifaGeneral } });
  },
};
