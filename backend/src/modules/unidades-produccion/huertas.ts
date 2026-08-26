import { calcularAreaEfectiva } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";

export function listarHuertas() {
  return prisma.huerta.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
}

export function crearHuerta(nombre: string, hectareasTotales: number) {
  return prisma.huerta.create({ data: { nombre, hectareasTotales } });
}

export function actualizarHuerta(id: string, data: { nombre?: string; hectareasTotales?: number; mapaUrl?: string; activo?: boolean }) {
  return prisma.huerta.update({ where: { id }, data });
}

export class HuertaTieneNominaCerradaError extends Error {
  constructor() {
    super("Esta Huerta tiene al menos un día de Nómina cerrado — no se puede borrar completa (rompería el historial de nómina ya cerrado). Desactívala en vez de borrarla.");
  }
}

/**
 * Borrar Huerta completa (25-ago-2026): a diferencia de "desactivar" (que
 * se usa en todo el resto del sistema para conservar historial), esta
 * acción es un borrado real e irreversible — pensada para limpiar una
 * Huerta creada por error o de prueba, no para retirar una Huerta que ya
 * operó de verdad. Por eso se bloquea si ya tiene algún día de Nómina
 * cerrado (señal de que sí hubo operación real). Solo Director General o
 * Encargado de Sistemas (candado en la ruta).
 *
 * Borra en cascada todo lo que cuelga de la Huerta (Cuadros, Secciones de
 * Riego, Ciclos, Aplicaciones/Fertilizantes/Actividades/Riego programados
 * y realizados, Nómina, Almacén Local) — Personal y Usuario ligados a esta
 * Huerta NO se borran, solo se les quita la referencia (huertaId = null),
 * porque una persona no deja de existir por perder su Huerta base.
 * Movimientos del Almacén Central que mencionan esta Huerta como destino
 * (huertaDestinoId) tampoco se tocan — es la bitácora propia de Central,
 * no del huerta que se borra, y no es una relación de base de datos real
 * (no tiene FK), así que no bloquea el borrado.
 */
export async function eliminarHuertaCompleta(huertaId: string) {
  await prisma.huerta.findUniqueOrThrow({ where: { id: huertaId } });

  const diaCerrado = await prisma.diaCerrado.findFirst({ where: { huertaId } });
  if (diaCerrado) throw new HuertaTieneNominaCerradaError();

  return prisma.$transaction(async (tx: TransactionClient) => {
    const cuadroIds = (await tx.cuadro.findMany({ where: { huertaId }, select: { id: true } })).map((c) => c.id);
    const seccionIds = (await tx.seccionRiego.findMany({ where: { huertaId }, select: { id: true } })).map((s) => s.id);
    const cicloIds = (await tx.ciclo.findMany({ where: { huertaId }, select: { id: true } })).map((c) => c.id);
    const aplicacionIds = (await tx.aplicacion.findMany({ where: { huertaId }, select: { id: true } })).map((a) => a.id);
    const fertilizacionIds = (await tx.fertilizacionGranular.findMany({ where: { huertaId }, select: { id: true } })).map((f) => f.id);
    const fertirriegoIds = (await tx.fertirriegoProgramacion.findMany({ where: { huertaId }, select: { id: true } })).map((f) => f.id);
    const actividadProgramadaIds = (await tx.actividadProgramada.findMany({ where: { huertaId }, select: { id: true } })).map((a) => a.id);
    const almacenLocalIds = (await tx.almacenLocal.findMany({ where: { huertaId }, select: { id: true } })).map((a) => a.id);
    const riegoIds = (await tx.riegoRegistroDiario.findMany({ where: { seccionId: { in: seccionIds } }, select: { id: true } })).map((r) => r.id);
    const aplicacionRealizadaIds = (await tx.aplicacionRealizada.findMany({ where: { aplicacionId: { in: aplicacionIds } }, select: { id: true } })).map((r) => r.id);
    const aplicacionLineaIds = (
      await tx.aplicacionRealizadaLinea.findMany({ where: { realizadaId: { in: aplicacionRealizadaIds } }, select: { id: true } })
    ).map((l) => l.id);
    const fertilizacionRealizadaIds = (
      await tx.fertilizacionGranularRealizada.findMany({ where: { fertilizacionId: { in: fertilizacionIds } }, select: { id: true } })
    ).map((r) => r.id);
    const actividadRealizadaIds = (
      await tx.actividadRealizada.findMany({ where: { actividadProgramadaId: { in: actividadProgramadaIds } }, select: { id: true } })
    ).map((a) => a.id);
    const actividadLineaIds = (
      await tx.actividadRealizadaLinea.findMany({ where: { realizadaId: { in: actividadRealizadaIds } }, select: { id: true } })
    ).map((l) => l.id);

    // Nivel hoja: líneas de personas y detalle de movimientos.
    await tx.aplicacionRealizadaLineaPersona.deleteMany({ where: { lineaId: { in: aplicacionLineaIds } } });
    await tx.actividadRealizadaLineaPersona.deleteMany({ where: { lineaId: { in: actividadLineaIds } } });
    await tx.riegoRegistroDiarioProducto.deleteMany({ where: { registroId: { in: riegoIds } } });
    await tx.almacenLocalMovimiento.deleteMany({ where: { almacenLocalId: { in: almacenLocalIds } } });

    // Líneas/reportes de avance.
    await tx.aplicacionRealizadaLinea.deleteMany({ where: { id: { in: aplicacionLineaIds } } });
    await tx.actividadRealizadaLinea.deleteMany({ where: { id: { in: actividadLineaIds } } });
    await tx.riegoRegistroDiario.deleteMany({ where: { id: { in: riegoIds } } });
    await tx.aplicacionRealizadaCuadro.deleteMany({ where: { realizadaId: { in: aplicacionRealizadaIds } } });
    await tx.fertilizacionGranularRealizadaCuadro.deleteMany({ where: { realizadaId: { in: fertilizacionRealizadaIds } } });
    await tx.actividadRealizadaCuadro.deleteMany({ where: { realizadaId: { in: actividadRealizadaIds } } });

    await tx.aplicacionRealizada.deleteMany({ where: { id: { in: aplicacionRealizadaIds } } });
    await tx.fertilizacionGranularRealizada.deleteMany({ where: { id: { in: fertilizacionRealizadaIds } } });
    await tx.actividadRealizada.deleteMany({ where: { id: { in: actividadRealizadaIds } } });

    // Órdenes de Compra automáticas generadas por estas programaciones — su
    // referencia no es un FK real (referenciaAplicacionId es un string
    // suelto que puede apuntar a Aplicacion/FertilizacionGranular/
    // FertirriegoProgramacion), así que hay que limpiarla a mano o quedaría
    // un pendiente de Compras "zombie" apuntando a una programación que ya
    // no existe (encontrado probando el borrado completo).
    await tx.ordenCompra.deleteMany({
      where: { referenciaAplicacionId: { in: [...aplicacionIds, ...fertilizacionIds, ...fertirriegoIds] } },
    });

    // Programaciones y su detalle (productos/cuadros/secciones).
    await tx.aplicacionProducto.deleteMany({ where: { aplicacionId: { in: aplicacionIds } } });
    await tx.aplicacionCuadro.deleteMany({ where: { aplicacionId: { in: aplicacionIds } } });
    await tx.fertilizacionGranularProducto.deleteMany({ where: { fertilizacionId: { in: fertilizacionIds } } });
    await tx.fertilizacionGranularCuadro.deleteMany({ where: { fertilizacionId: { in: fertilizacionIds } } });
    await tx.fertirriegoProgramacionProducto.deleteMany({ where: { fertirriegoId: { in: fertirriegoIds } } });
    await tx.fertirriegoSeccion.deleteMany({ where: { fertirriegoId: { in: fertirriegoIds } } });
    await tx.actividadProgramadaCuadro.deleteMany({ where: { actividadProgramadaId: { in: actividadProgramadaIds } } });

    await tx.aplicacion.deleteMany({ where: { id: { in: aplicacionIds } } });
    await tx.fertilizacionGranular.deleteMany({ where: { id: { in: fertilizacionIds } } });
    await tx.fertirriegoProgramacion.deleteMany({ where: { id: { in: fertirriegoIds } } });
    await tx.actividadProgramada.deleteMany({ where: { id: { in: actividadProgramadaIds } } });

    // Nómina, Equipos, Laboratorio, Almacén Local — ligados directo a la Huerta.
    await tx.registroNomina.deleteMany({ where: { huertaId } });
    await tx.diaCerrado.deleteMany({ where: { huertaId } });
    await tx.equipoUsoDiario.deleteMany({ where: { huertaId } });
    await tx.analisisLaboratorio.deleteMany({ where: { huertaId } });
    await tx.almacenLocal.deleteMany({ where: { huertaId } });

    // Estructura de Unidades de Producción.
    await tx.cuadroVersion.deleteMany({ where: { cuadroId: { in: cuadroIds } } });
    await tx.cicloVariedad.deleteMany({ where: { OR: [{ cuadroId: { in: cuadroIds } }, { cicloId: { in: cicloIds } }] } });
    await tx.seccionRiegoCuadro.deleteMany({ where: { OR: [{ cuadroId: { in: cuadroIds } }, { seccionId: { in: seccionIds } }] } });

    await tx.cuadro.deleteMany({ where: { huertaId } });
    await tx.seccionRiego.deleteMany({ where: { huertaId } });
    await tx.ciclo.deleteMany({ where: { huertaId } });

    // Personas y cuentas ligadas: se quita la referencia, no se borran.
    await tx.personal.updateMany({ where: { huertaId }, data: { huertaId: null } });
    await tx.usuario.updateMany({ where: { huertaId }, data: { huertaId: null } });

    await tx.huerta.delete({ where: { id: huertaId } });
  });
}

/**
 * Área efectiva + % de aprovechamiento (9.1): suma de hectáreas de la
 * versión VIGENTE de cada Cuadro activo de la Huerta, hoy.
 */
export async function calcularAreaEfectivaHuerta(huertaId: string) {
  const huerta = await prisma.huerta.findUniqueOrThrow({ where: { id: huertaId } });
  const cuadros = await prisma.cuadro.findMany({ where: { huertaId, estatus: "activo" } });
  const hoy = new Date();

  const hectareasPorCuadro: number[] = [];
  for (const cuadro of cuadros) {
    const version = await prisma.cuadroVersion.findFirst({
      where: { cuadroId: cuadro.id, vigenteDesde: { lte: hoy }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: hoy } }] },
    });
    if (version) hectareasPorCuadro.push(Number(version.hectareas));
  }

  return calcularAreaEfectiva(Number(huerta.hectareasTotales), hectareasPorCuadro);
}
