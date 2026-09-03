import {
  calcularCantidadTotalFertirriego,
  formatearCantidadProductoFertirriego,
  ordenarPorNombreNumerico,
  riegosEnVentana,
  type ModoDosisFertirriego,
} from "@cbf/shared";
import type { FrecuenciaFertirriego, Prisma, Rol } from "@prisma/client";
import { prisma } from "../../core/db.js";
import {
  ajustarCantidadProducto,
  confirmarEntregaComprometida,
  intentarComprometer,
  liberarComprometido,
  stockTotalProductoTx,
} from "../almacen/movimientos.js";
import { obtenerVersionVigente } from "../unidades-produccion/cuadros.js";
import { ProductoNoAutorizadoFertilizanteError, StockNoComprometidoError, TransicionFertilizacionInvalidaError } from "./granular.js";
import { actualizarDosisProductoEnRecetaFertirriego, obtenerRecetaFertirriego, ROLES_RECETAS_FERTIRRIEGO } from "./recetario-fertirriego.js";
import { cancelarOrdenesDeReferencia } from "../compras/ordenes.js";

const DIAS_VENCIMIENTO = 15;

/** Hectáreas totales de un conjunto de Secciones de Riego, a partir de sus Cuadros — no se persiste, se recalcula cada vez (mismo criterio de programarFertirriego). */
async function hectareasDeSecciones(seccionIds: string[], fecha: Date): Promise<number> {
  let hectareasTotales = 0;
  for (const seccionId of seccionIds) {
    const cuadrosSeccion = await prisma.seccionRiegoCuadro.findMany({ where: { seccionId } });
    for (const { cuadroId } of cuadrosSeccion) {
      const version = await obtenerVersionVigente(cuadroId, fecha);
      if (version) hectareasTotales += Number(version.hectareas);
    }
  }
  return hectareasTotales;
}

export interface ProductoFertirriegoInput {
  productoId: string;
  dosisValor: number;
  dosisUnidad: ModoDosisFertirriego;
}

export interface ProgramarFertirriegoInput {
  huertaId: string;
  seccionIds: string[];
  productos: ProductoFertirriegoInput[];
  frecuencia: "diario" | "cada_2_dias" | "cada_3_dias" | "patron_2_1";
  fechaInicio: string;
  fechaFin: string;
  // Recetario de Fertirriego (20-ago-2026, corregido 27-ago-2026 — modelo
  // propio RecetaFertirriego, ya no el Receta compartido de Aplicaciones).
  recetaId?: string;
  actualizarRecetaOriginal?: boolean;
}

export class RolNoPuedeAjustarRecetaFertirriegoError extends Error {
  constructor() {
    super("Tu rol solo puede usar esta receta tal cual está guardada — no puede cambiar la dosis. Pide a Dirección General o al Gerente Técnico de Producción que la ajuste.");
  }
}

export class YaHayAvanceRegistradoFertirriegoError extends Error {
  constructor() {
    super("Este fertirriego ya tiene al menos un día registrado en Riego — no se puede editar la programación, libérala y reprograma con los datos correctos.");
  }
}

async function validarUsoDeRecetaFertirriego(recetaId: string, usuarioRol: Rol, productos: ProductoFertirriegoInput[]) {
  const receta = await obtenerRecetaFertirriego(recetaId);
  if (!ROLES_RECETAS_FERTIRRIEGO.includes(usuarioRol)) {
    const mismasDosis = receta.productos.every((rp) => {
      const enviado = productos.find((p) => p.productoId === rp.productoId);
      return enviado && Number(rp.dosisValor) === enviado.dosisValor && rp.dosisUnidad === enviado.dosisUnidad;
    });
    if (!mismasDosis || receta.productos.length !== productos.length) {
      throw new RolNoPuedeAjustarRecetaFertirriegoError();
    }
  }
  return receta;
}

/**
 * Programar — Camino 2 Fertirriego (9.5): se programa por Sección de Riego,
 * no por Cuadro. Dosis directa por hectárea (kg/ha, L/ha o g/ha, corregido
 * 27-ago-2026 — ver comentario completo en el schema, FertirriegoProgramacion)
 * × hectáreas de las Secciones elegidas — sin concentración, litros de
 * agua ni tanque de por medio. Varios productos (10-ago-2026): cada uno
 * conserva su propia dosis, calculada de forma independiente (igual que
 * Granular, ya no como Aplicaciones). No hay "registrar como realizada"
 * aquí — una vez entregado a la Huerta, la ejecución diaria se registra
 * desde Riego (9.6).
 */
export async function programarFertirriego(input: ProgramarFertirriegoInput, creadoPorId: string, usuarioRol: Rol) {
  if (input.seccionIds.length === 0) {
    throw new Error("Elige al menos una Sección de Riego.");
  }
  if (!input.productos || input.productos.length === 0) {
    throw new Error("Elige al menos un producto.");
  }
  const productos = await prisma.producto.findMany({ where: { id: { in: input.productos.map((p) => p.productoId) } } });
  for (const p of productos) {
    if (p.categoria !== "fertilizante" || !p.autorizado) {
      throw new ProductoNoAutorizadoFertilizanteError();
    }
  }

  if (input.recetaId) {
    await validarUsoDeRecetaFertirriego(input.recetaId, usuarioRol, input.productos);
    if (input.actualizarRecetaOriginal) {
      for (const p of input.productos) {
        await actualizarDosisProductoEnRecetaFertirriego(input.recetaId, p.productoId, p.dosisValor, p.dosisUnidad);
      }
    }
  }

  const fechaRef = new Date(input.fechaInicio);
  const fechaFinRef = new Date(input.fechaFin);
  const hectareasTotales = await hectareasDeSecciones(input.seccionIds, fechaRef);
  if (hectareasTotales === 0) {
    throw new Error("Las Secciones de Riego elegidas no tienen Cuadros con una configuración vigente para la fecha de inicio.");
  }
  // Corrección de fondo (2-sep-2026): "Confirmar entrega" es un evento
  // ÚNICO por fertirriego (no hay "registrar entrega" por cada riego) — la
  // entrega a la Huerta tiene que cubrir TODA la campaña de una vez, o los
  // riegos posteriores al primero se quedan sin nada que descontar de
  // Almacén Local. Por eso lo que se compromete/pide a Almacén al programar
  // (y lo que se entrega después) es el total de TODA la campaña
  // (dosis × hectáreas × número de ocasiones), no una sola ocasión — el
  // "por ocasión" (`cantidadTotalCalculada`) se sigue guardando tal cual,
  // solo cambia para qué se usa: guía de cuánto va en el tanque cada
  // riego (Riego 9.6, Orden de Fertirriego), ya no para comprometer stock.
  const riegosCampania = calcularRiegosEnCampania({ frecuencia: input.frecuencia, fechaInicio: fechaRef, fechaFin: fechaFinRef });

  return prisma.$transaction(async (tx) => {
    const fertirriego = await tx.fertirriegoProgramacion.create({
      data: {
        huertaId: input.huertaId,
        recetaId: input.recetaId,
        frecuencia: input.frecuencia,
        fechaInicio: fechaRef,
        fechaFin: fechaFinRef,
        creadoPorId,
      },
    });
    await tx.fertirriegoSeccion.createMany({
      data: input.seccionIds.map((seccionId) => ({ fertirriegoId: fertirriego.id, seccionId })),
    });

    for (const p of input.productos) {
      const cantidadTotalCalculada = calcularCantidadTotalFertirriego(p.dosisValor, p.dosisUnidad, hectareasTotales);
      const cantidadCampania = cantidadTotalCalculada * riegosCampania;
      await tx.fertirriegoProgramacionProducto.create({
        data: {
          fertirriegoId: fertirriego.id,
          productoId: p.productoId,
          dosisValor: p.dosisValor,
          dosisUnidad: p.dosisUnidad,
          cantidadTotalCalculada,
        },
      });

      const comprometido = await intentarComprometer(tx, p.productoId, cantidadCampania, fertirriego.id, creadoPorId);
      if (!comprometido) {
        const disponible = await stockTotalProductoTx(tx, p.productoId);
        const faltante = cantidadCampania - disponible;
        await tx.ordenCompra.create({
          data: {
            origen: "automatica",
            productoId: p.productoId,
            cantidadSolicitada: faltante,
            estado: "pendiente_cotizar",
            referenciaAplicacionId: fertirriego.id,
            creadoPorId,
          },
        });
      }
    }
    return fertirriego;
  });
}

/**
 * Editar el fertirriego ya programado/entregado (1.9, 31-ago-2026) —
 * mismo criterio que Aplicaciones/Granular: permitido mientras Riego no
 * tenga todavía ningún día registrado sobre él. Mismos roles que autorizan
 * "Programar" (se valida en la ruta con ROLES_PROGRAMAR, igual que POST /).
 */
export async function editarFertirriegoProgramada(id: string, input: Omit<ProgramarFertirriegoInput, "huertaId">, editadoPorId: string, usuarioRol: Rol) {
  if (input.seccionIds.length === 0) {
    throw new Error("Elige al menos una Sección de Riego.");
  }
  if (!input.productos || input.productos.length === 0) {
    throw new Error("Elige al menos un producto.");
  }

  const fertirriego = await prisma.fertirriegoProgramacion.findUniqueOrThrow({
    where: { id },
    include: { productos: true, secciones: true },
  });
  if (fertirriego.estado !== "programada" && fertirriego.estado !== "entregada") {
    throw new TransicionFertilizacionInvalidaError("programada o entregada");
  }
  const seccionIdsActuales = fertirriego.secciones.map((s) => s.seccionId);
  if (await fertirriegoTieneAvanceRegistrado(seccionIdsActuales, fertirriego.fechaInicio, fertirriego.fechaFin)) {
    throw new YaHayAvanceRegistradoFertirriegoError();
  }

  const productosNuevos = await prisma.producto.findMany({ where: { id: { in: input.productos.map((p) => p.productoId) } } });
  for (const p of productosNuevos) {
    if (p.categoria !== "fertilizante" || !p.autorizado) {
      throw new ProductoNoAutorizadoFertilizanteError();
    }
  }

  if (input.recetaId) {
    await validarUsoDeRecetaFertirriego(input.recetaId, usuarioRol, input.productos);
    if (input.actualizarRecetaOriginal) {
      for (const p of input.productos) {
        await actualizarDosisProductoEnRecetaFertirriego(input.recetaId, p.productoId, p.dosisValor, p.dosisUnidad);
      }
    }
  }

  const fechaRef = new Date(input.fechaInicio);
  const fechaFinRef = new Date(input.fechaFin);
  const hectareasTotales = await hectareasDeSecciones(input.seccionIds, fechaRef);
  if (hectareasTotales === 0) {
    throw new Error("Las Secciones de Riego elegidas no tienen Cuadros con una configuración vigente para la fecha de inicio.");
  }

  const entregada = fertirriego.estado === "entregada";
  // Igual que en programarFertirriego (2-sep-2026): lo que se ajusta en
  // Almacén es el total de CAMPAÑA, no una ocasión — necesita el número de
  // riegos ANTES del cambio (por si frecuencia/fechas también cambiaron) y
  // el de DESPUÉS, para comparar campaña completa contra campaña completa.
  const riegosCampaniaAnterior = calcularRiegosEnCampania(fertirriego);
  const riegosCampaniaNueva = calcularRiegosEnCampania({ frecuencia: input.frecuencia, fechaInicio: fechaRef, fechaFin: fechaFinRef });

  return prisma.$transaction(async (tx) => {
    const productosAnteriores = new Map(fertirriego.productos.map((p) => [p.productoId, p]));
    const productoIdsNuevos = new Set(input.productos.map((p) => p.productoId));

    for (const anterior of fertirriego.productos) {
      if (productoIdsNuevos.has(anterior.productoId)) continue;
      const cantidadCampaniaAnterior = Number(anterior.cantidadTotalCalculada) * riegosCampaniaAnterior;
      await ajustarCantidadProducto(tx, fertirriego.huertaId, id, anterior.productoId, cantidadCampaniaAnterior, 0, entregada, editadoPorId);
      await tx.fertirriegoProgramacionProducto.delete({ where: { id: anterior.id } });
    }

    for (const p of input.productos) {
      const cantidadNueva = calcularCantidadTotalFertirriego(p.dosisValor, p.dosisUnidad, hectareasTotales);
      const cantidadCampaniaNueva = cantidadNueva * riegosCampaniaNueva;
      const anterior = productosAnteriores.get(p.productoId);
      const cantidadCampaniaAnterior = anterior ? Number(anterior.cantidadTotalCalculada) * riegosCampaniaAnterior : 0;

      await ajustarCantidadProducto(tx, fertirriego.huertaId, id, p.productoId, cantidadCampaniaAnterior, cantidadCampaniaNueva, entregada, editadoPorId);

      if (anterior) {
        await tx.fertirriegoProgramacionProducto.update({
          where: { id: anterior.id },
          data: { dosisValor: p.dosisValor, dosisUnidad: p.dosisUnidad, cantidadTotalCalculada: cantidadNueva },
        });
      } else {
        await tx.fertirriegoProgramacionProducto.create({
          data: { fertirriegoId: id, productoId: p.productoId, dosisValor: p.dosisValor, dosisUnidad: p.dosisUnidad, cantidadTotalCalculada: cantidadNueva },
        });
      }
    }

    await tx.fertirriegoSeccion.deleteMany({ where: { fertirriegoId: id } });
    await tx.fertirriegoSeccion.createMany({ data: input.seccionIds.map((seccionId) => ({ fertirriegoId: id, seccionId })) });

    return tx.fertirriegoProgramacion.update({
      where: { id },
      data: {
        recetaId: input.recetaId ?? null,
        frecuencia: input.frecuencia,
        fechaInicio: fechaRef,
        fechaFin: fechaFinRef,
      },
    });
  });
}

const INCLUDE_FERTIRRIEGO = { huerta: true, receta: true, productos: { include: { producto: true } }, secciones: { include: { seccion: true } } };

type FertirriegoBase = {
  id: string;
  estado: string;
  fechaCreacion: Date;
  frecuencia: FrecuenciaFertirriego;
  fechaInicio: Date;
  fechaFin: Date;
  secciones: { seccionId: string }[];
  productos: { productoId: string; dosisUnidad: ModoDosisFertirriego; cantidadTotalCalculada: Prisma.Decimal }[];
};

/**
 * ¿Ya se registró al menos un día de Riego (aplicado, o "no se metió" con
 * motivo) dentro del rango de fechas de este fertirriego, en cualquiera de
 * sus Secciones? (1.9, 31-ago-2026). Cualquier registro cuenta como
 * "avance" — incluso un día explícitamente NO aplicado ya es un día
 * trabajado sobre esta programación, no solo los que sí metieron producto.
 * A diferencia de Aplicaciones/Granular, Fertirriego no tiene su propio
 * modelo "realizada" — la ejecución vive por completo en Riego
 * (RiegoRegistroDiario), sin FK directa al fertirriego, así que se cruza
 * por Sección + rango de fechas (mismo criterio que fertirriegoVigente en
 * riego.ts).
 */
async function fertirriegoTieneAvanceRegistrado(seccionIds: string[], fechaInicio: Date, fechaFin: Date): Promise<boolean> {
  const registro = await prisma.riegoRegistroDiario.findFirst({
    where: { seccionId: { in: seccionIds }, fecha: { gte: fechaInicio, lte: fechaFin } },
  });
  return registro !== null;
}

/**
 * Cuántos riegos caen en toda la campaña (1.6, 31-ago-2026; 2-sep-2026:
 * dejó de ser solo informativo — ver comentario en `programarFertirriego`,
 * es la base real de cuánto se compromete/pide a Almacén y cuánto se
 * entrega, no solo lo que se muestra en pantalla).
 */
export function calcularRiegosEnCampania(fertirriego: Pick<FertirriegoBase, "frecuencia" | "fechaInicio" | "fechaFin">): number {
  const diasCampania = Math.round((fertirriego.fechaFin.getTime() - fertirriego.fechaInicio.getTime()) / 86_400_000) + 1;
  return riegosEnVentana(fertirriego.frecuencia, diasCampania);
}

async function enriquecerConAlertas<T extends FertirriegoBase>(fertirriego: T) {
  const comprometidos = await prisma.almacenCentralMovimiento.findMany({ where: { referenciaId: fertirriego.id, tipo: "salida_comprometida" } });
  const comprometido = fertirriego.productos.every((p) => comprometidos.some((m) => m.productoId === p.productoId));
  const diasSinEntregar = fertirriego.estado === "programada" ? Math.floor((Date.now() - fertirriego.fechaCreacion.getTime()) / 86_400_000) : null;

  const riegosEnCampania = calcularRiegosEnCampania(fertirriego);
  const productos = fertirriego.productos.map((p) => ({
    ...p,
    cantidadCampania: formatearCantidadProductoFertirriego(p.dosisUnidad, Number(p.cantidadTotalCalculada) * riegosEnCampania),
  }));
  const tieneAvanceRegistrado = await fertirriegoTieneAvanceRegistrado(
    fertirriego.secciones.map((s) => s.seccionId),
    fertirriego.fechaInicio,
    fertirriego.fechaFin
  );

  return {
    ...fertirriego,
    productos,
    comprometido,
    diasSinEntregar,
    alertaVencimiento: (diasSinEntregar ?? 0) > DIAS_VENCIMIENTO,
    riegosEnCampania,
    tieneAvanceRegistrado,
  };
}

/**
 * La lista también trae `comprometido`/alertas, no solo el detalle — mismo
 * ajuste que Aplicaciones/Granular, encontrado probando la pantalla real.
 */
/** 9.15 (31-ago-2026): Secciones/Válvulas en orden numérico ("Válvula 2" antes que "Válvula 10"), no alfabético. */
function ordenarSeccionesDe<T extends { secciones: { seccion: { nombre: string } }[] }>(item: T): T {
  item.secciones = ordenarPorNombreNumerico(item.secciones, (s) => s.seccion.nombre);
  return item;
}

/**
 * Por default no trae las "vencida" (liberadas) ni "cancelada" — se
 * quedaban en la lista para siempre, solo con su tag de color, sin forma
 * de dejar de verlas (bug real reportado por Diego, 31-ago-2026, ampliado
 * a "cancelada" el mismo día). Siguen existiendo en la base de datos (no
 * se borran — la trazabilidad de Almacén las sigue referenciando), solo se
 * ocultan de la vista activa; `incluirCerradas` las trae de vuelta para
 * consulta/historial.
 */
export async function listarFertirriego(huertaId?: string, incluirCerradas?: boolean) {
  const fertirriegos = await prisma.fertirriegoProgramacion.findMany({
    where: { huertaId, ...(incluirCerradas ? {} : { estado: { notIn: ["vencida", "cancelada"] } }) },
    include: INCLUDE_FERTIRRIEGO,
    orderBy: { fechaCreacion: "desc" },
  });
  fertirriegos.forEach(ordenarSeccionesDe);
  return Promise.all(fertirriegos.map((f) => enriquecerConAlertas(f)));
}

export async function obtenerFertirriego(id: string) {
  const fertirriego = await prisma.fertirriegoProgramacion.findUniqueOrThrow({
    where: { id },
    include: INCLUDE_FERTIRRIEGO,
  });
  ordenarSeccionesDe(fertirriego);
  return enriquecerConAlertas(fertirriego);
}

/**
 * Confirma la entrega física a la Huerta de TODOS los productos — acción de
 * Almacén (Bodega). A partir de aquí, la ejecución diaria vive en Riego
 * (9.6). Entrega el total de CAMPAÑA completa (2-sep-2026) — es un evento
 * único (no hay "entregar" por cada riego), así que tiene que cubrir toda
 * la campaña de una vez o los riegos después del primero se quedan sin
 * nada que descontar en Almacén Local.
 */
export async function confirmarEntregaFertirriego(id: string, capturadoPorId: string) {
  const fertirriego = await prisma.fertirriegoProgramacion.findUniqueOrThrow({ where: { id }, include: { productos: true } });
  if (fertirriego.estado !== "programada") throw new TransicionFertilizacionInvalidaError("programada");
  const riegosCampania = calcularRiegosEnCampania(fertirriego);

  return prisma.$transaction(async (tx) => {
    const comprometidos = await tx.almacenCentralMovimiento.findMany({ where: { referenciaId: id, tipo: "salida_comprometida" } });
    const faltaAlguno = fertirriego.productos.some((p) => !comprometidos.some((m) => m.productoId === p.productoId));
    if (faltaAlguno) throw new StockNoComprometidoError();

    for (const p of fertirriego.productos) {
      const cantidadCampania = Number(p.cantidadTotalCalculada) * riegosCampania;
      await confirmarEntregaComprometida(tx, p.productoId, fertirriego.huertaId, cantidadCampania, id, capturadoPorId);
    }
    return tx.fertirriegoProgramacion.update({ where: { id }, data: { estado: "entregada" } });
  });
}

/**
 * Cierra una programación que nunca se entregó (vencida a 15 días, o
 * cancelación manual). Libera el stock comprometido de cada producto que sí
 * llegó a apartarse — el total de CAMPAÑA completa (2-sep-2026), porque eso
 * es lo que de verdad se comprometió al programar (ver programarFertirriego).
 */
export async function liberarFertirriegoVencido(id: string, capturadoPorId: string) {
  const fertirriego = await prisma.fertirriegoProgramacion.findUniqueOrThrow({ where: { id }, include: { productos: true } });
  if (fertirriego.estado !== "programada") throw new TransicionFertilizacionInvalidaError("programada");
  const riegosCampania = calcularRiegosEnCampania(fertirriego);

  return prisma.$transaction(async (tx) => {
    for (const p of fertirriego.productos) {
      const comprometido = await tx.almacenCentralMovimiento.findFirst({
        where: { referenciaId: id, tipo: "salida_comprometida", productoId: p.productoId },
      });
      if (comprometido) {
        await liberarComprometido(
          tx,
          p.productoId,
          Number(p.cantidadTotalCalculada) * riegosCampania,
          id,
          capturadoPorId,
          "Liberación de fertirriego vencido (15 días sin entregar) o cancelado manualmente."
        );
      }
    }
    // 1.5 (2-sep-2026): cualquier orden de compra ligada a este fertirriego
    // que todavía no haya llegado a Almacén se cancela junto.
    await cancelarOrdenesDeReferencia(tx, id);
    return tx.fertirriegoProgramacion.update({ where: { id }, data: { estado: "vencida" } });
  });
}
