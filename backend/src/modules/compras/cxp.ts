import { prisma } from "../../core/db.js";

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * El pago a Proveedores solo ocurre los viernes (9.14). Dado el límite de
 * pago calculado (formalización + días de crédito), el viernes en que debe
 * pagarse es el viernes más cercano SIN pasarse de esa fecha — pagar antes
 * de que venza el crédito, nunca después. Si el límite ya cae en viernes,
 * ese es el día.
 */
export function viernesDePago(fechaLimite: Date): Date {
  const dia = fechaLimite.getDay(); // 0=domingo … 5=viernes … 6=sábado
  const diasDesdeViernes = (dia - 5 + 7) % 7; // cuántos días atrás está el viernes más reciente
  return new Date(fechaLimite.getTime() - diasDesdeViernes * MS_DIA);
}

export interface OrdenCxP {
  id: string;
  producto: { nombreComercial: string };
  proveedor: { id: string; nombre: string; diasCredito: number };
  precioUnitario: string | null;
  cantidadSolicitada: string;
  fechaFormalizacion: Date;
  fechaLimitePago: Date;
  viernesDePago: Date;
  alertaVisible: boolean; // visible desde el miércoles anterior al viernes de pago
}

/** Cuentas por Pagar (9.14): órdenes formalizadas, con crédito y todavía no pagadas. */
export async function listarCxP(): Promise<OrdenCxP[]> {
  const ordenes = await prisma.ordenCompra.findMany({
    where: {
      pagada: false,
      fechaFormalizacion: { not: null },
      estado: { in: ["generada", "recibida"] },
      proveedor: { diasCredito: { not: null } },
    },
    include: { producto: true, proveedor: true },
  });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return ordenes
    .filter((o) => o.fechaFormalizacion && o.proveedor?.diasCredito != null)
    .map((o) => {
      const fechaLimitePago = new Date(o.fechaFormalizacion!.getTime() + o.proveedor!.diasCredito! * MS_DIA);
      const viernes = viernesDePago(fechaLimitePago);
      const miercolesAnterior = new Date(viernes.getTime() - 2 * MS_DIA);
      return {
        id: o.id,
        producto: { nombreComercial: o.producto.nombreComercial },
        proveedor: { id: o.proveedor!.id, nombre: o.proveedor!.nombre, diasCredito: o.proveedor!.diasCredito! },
        precioUnitario: o.precioUnitario ? o.precioUnitario.toString() : null,
        cantidadSolicitada: o.cantidadSolicitada.toString(),
        fechaFormalizacion: o.fechaFormalizacion!,
        fechaLimitePago,
        viernesDePago: viernes,
        alertaVisible: hoy >= miercolesAnterior,
      };
    })
    .sort((a, b) => a.fechaLimitePago.getTime() - b.fechaLimitePago.getTime());
}
