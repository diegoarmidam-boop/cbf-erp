import { calcularCantidadTotal, formatearCantidadProducto, mlSolucionPorPlanta, plantasTotalesCuadro, riegosEnSemana, semanaDeFecha } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { obtenerAplicacion } from "../aplicaciones/aplicaciones.js";
import { obtenerFertirriego } from "../fertilizantes/fertirriego.js";
import { obtenerVersionVigente } from "../unidades-produccion/cuadros.js";

const ETIQUETA_RECURSO: Record<string, string> = { mochila: "Mochila", turbina: "Turbina", aguilon: "Aguilón" };
const ETIQUETA_FRECUENCIA: Record<string, string> = {
  diario: "Diario",
  cada_2_dias: "Cada 2 días",
  cada_3_dias: "Cada 3 días",
  patron_2_1: "2 sí, 1 no",
};
const ETIQUETA_UNIDAD_DOSIS: Record<string, string> = { ml_l: "mL/L", g_l: "g/L", kg_l: "kg/L" };

export class OrdenSinCapacidadTanqueError extends Error {
  constructor() {
    super("Esta programación no tiene capturada la capacidad del tanque/recipiente — captúrala editando el Paso 1 para poder generar la Orden.");
  }
}

/**
 * Orden de Aplicación (9.7, 25-ago-2026): documento de salida para el
 * Encargado de Fumigación, diseñado a partir del formato Excel real de la
 * empresa. Capa de presentación pura sobre datos/cálculos ya construidos
 * (Recetario, mezcla por tanque) — no recalcula nada de negocio, solo
 * empaqueta con el vocabulario exacto que pide el documento.
 */
export async function construirOrdenAplicacion(aplicacionId: string) {
  const aplicacion = await obtenerAplicacion(aplicacionId);
  if (aplicacion.capacidadTanque == null || !aplicacion.mezclaPorTanque) {
    throw new OrdenSinCapacidadTanqueError();
  }

  const hectareasTotales = Number(aplicacion.hectareasTotalesProgramadas);
  const litrosMezclaPorHa = Number(aplicacion.litrosMezclaPorHa);
  const capacidadTanque = Number(aplicacion.capacidadTanque);
  const volumenTotalAguaL = litrosMezclaPorHa * hectareasTotales;
  const fechaInicioISO = aplicacion.fechaInicio.toISOString().slice(0, 10);

  // No. de aplicación (25-ago-2026): posición ordinal entre las
  // Aplicaciones de esta misma Huerta, por fecha de creación — no es un
  // dato capturado, se deriva solo, igual que "Tanques a preparar".
  const numeroAplicacion = await prisma.aplicacion.count({
    where: { huertaId: aplicacion.huertaId, fechaCreacion: { lte: aplicacion.fechaCreacion } },
  });

  // Plantas a tratar: suma del Marco de Plantación vigente (a la fecha de
  // inicio) de cada Cuadro programado — null si a ALGUNO le falta Marco de
  // Plantación configurado (mejor no mostrar un total incompleto/engañoso
  // que inventar un dato).
  let plantasATratar: number | null = 0;
  for (const { cuadroId } of aplicacion.cuadros) {
    const version = await obtenerVersionVigente(cuadroId, aplicacion.fechaInicio);
    if (!version || !version.distSurcosM || !version.distPlantasM) {
      plantasATratar = null;
      break;
    }
    plantasATratar! += plantasTotalesCuadro(Number(version.hectareas), Number(version.distSurcosM), Number(version.distPlantasM));
  }

  const tanquesCompletos = aplicacion.mezclaPorTanque[0]?.tanquesCompletos ?? 0;
  const hayParcial = aplicacion.mezclaPorTanque.some((m) => m.tanqueParcial != null);
  const tanquesAPreparar = tanquesCompletos + (hayParcial ? 1 : 0);
  const hectareasPorTanque = aplicacion.mezclaPorTanque[0]?.hectareasPorTanque ?? 0;

  const tipoAplicacionNombre = aplicacion.tipoAplicacion?.nombre ?? null;
  const esDrench = tipoAplicacionNombre?.trim().toLowerCase() === "drench";

  const productos = aplicacion.productos.map((p, i) => {
    const mezcla = aplicacion.mezclaPorTanque!.find((m) => m.productoId === p.productoId) ?? aplicacion.mezclaPorTanque![i]!;
    const cantidadUltimoTanqueBase = mezcla.tanqueParcial ? mezcla.tanqueParcial.cantidadProducto : mezcla.cantidadProductoPorTanqueCompleto;
    return {
      numero: i + 1,
      nombreComercial: p.producto.nombreComercial,
      ingredienteActivo: p.producto.ingredienteActivo ?? "—",
      dosisValor: Number(p.concentracionValor),
      unidadDosis: ETIQUETA_UNIDAD_DOSIS[p.concentracionUnidad],
      cantidadTotalLote: formatearCantidadProducto(p.concentracionUnidad, Number(p.cantidadTotalCalculada)),
      cantidadPorTanqueCompleto: formatearCantidadProducto(p.concentracionUnidad, mezcla.cantidadProductoPorTanqueCompleto),
      cantidadUltimoTanque: formatearCantidadProducto(p.concentracionUnidad, cantidadUltimoTanqueBase),
    };
  });

  // "0 tanques completos" no se dice en campo — si no hay ninguno completo,
  // el resumen solo menciona el tanque parcial (encontrado probando con una
  // Aplicación de menos de 1 tanque completo).
  const clausulaCompletos = tanquesCompletos > 0 ? `${tanquesCompletos} tanque${tanquesCompletos === 1 ? "" : "s"} completo${tanquesCompletos === 1 ? "" : "s"} de ${capacidadTanque} L` : null;
  const clausulaParcial = hayParcial
    ? `1 tanque parcial de ${Math.round((aplicacion.mezclaPorTanque[0]!.tanqueParcial!.volumenMezcla + Number.EPSILON) * 100) / 100} L`
    : null;
  const resumenPreparar = `PREPARAR: ${[clausulaCompletos, clausulaParcial].filter(Boolean).join(" + ")}`;
  const resumenPrepararConDrench =
    esDrench && plantasATratar
      ? `${resumenPreparar} · DRENCH: ${Math.round((mlSolucionPorPlanta(volumenTotalAguaL, plantasATratar) ?? 0) * 100) / 100} mL de solución por planta`
      : resumenPreparar;

  return {
    encabezado: {
      semana: semanaDeFecha(fechaInicioISO),
      loteHuerta: aplicacion.huerta.nombre,
      numeroAplicacion,
      fechaProgramada: fechaInicioISO,
      capacidadTanque,
      tipoAplicacion: tipoAplicacionNombre,
      hectareasAAplicar: hectareasTotales,
      gastoAguaLHa: litrosMezclaPorHa,
      volumenTotalAguaL: Math.round(volumenTotalAguaL * 100) / 100,
      tanquesAPreparar,
      plantasATratar,
      numeroProductos: productos.length,
      equipoAplicacion: ETIQUETA_RECURSO[aplicacion.recursoSugerido] ?? aplicacion.recursoSugerido,
      hectareasPorTanque: Math.round(hectareasPorTanque * 100) / 100,
    },
    resumenPreparar: resumenPrepararConDrench,
    drench:
      esDrench && plantasATratar
        ? { mlPorPlanta: Math.round((mlSolucionPorPlanta(volumenTotalAguaL, plantasATratar) ?? 0) * 100) / 100 }
        : null,
    productos,
  };
}

export type OrdenAplicacion = Awaited<ReturnType<typeof construirOrdenAplicacion>>;

/**
 * Orden de Fertirriego (9.5 Camino 2, 25-ago-2026): documento para el
 * Encargado de Riego. Desglose por válvula = Sección de Riego, usando las
 * hectáreas ya existentes de cada una (9.1) — no requiere ningún campo
 * nuevo. Reutiliza calcularCantidadTotal indirectamente vía la misma
 * proporción hectáreas-de-la-válvula/hectáreas-totales que ya usa el
 * cálculo de mezcla por tanque.
 */
export async function construirOrdenFertirriego(fertirriegoId: string) {
  const fertirriego = await obtenerFertirriego(fertirriegoId);
  if (fertirriego.capacidadTanque == null) {
    throw new OrdenSinCapacidadTanqueError();
  }

  const litrosAguaPorHa = Number(fertirriego.litrosAguaPorHa);
  const fechaInicioISO = fertirriego.fechaInicio.toISOString().slice(0, 10);

  const valvulas: { seccionId: string; nombre: string; hectareas: number }[] = [];
  for (const { seccionId, seccion } of fertirriego.secciones) {
    const cuadrosSeccion = await prisma.seccionRiegoCuadro.findMany({ where: { seccionId } });
    let hectareas = 0;
    for (const { cuadroId } of cuadrosSeccion) {
      const version = await obtenerVersionVigente(cuadroId, fertirriego.fechaInicio);
      if (version) hectareas += Number(version.hectareas);
    }
    valvulas.push({ seccionId, nombre: seccion.nombre, hectareas });
  }
  const hectareasTotales = valvulas.reduce((s, v) => s + v.hectareas, 0);

  const riegos = riegosEnSemana(fertirriego.frecuencia as "diario" | "cada_2_dias" | "cada_3_dias" | "patron_2_1");

  // Cantidad de cada producto por válvula: misma fórmula ya construida
  // (concentración × litros de agua/ha × hectáreas), aplicada con las
  // hectáreas propias de esa válvula en vez de las hectáreas totales.
  const productosTabla = fertirriego.productos.map((p) => {
    const porValvula = valvulas.map((v) => ({
      seccionId: v.seccionId,
      cantidad: formatearCantidadProducto(p.dosisUnidad, calcularCantidadTotal(Number(p.dosisValor), p.dosisUnidad, litrosAguaPorHa, v.hectareas)),
    }));
    const totalPorRiego = formatearCantidadProducto(p.dosisUnidad, Number(p.cantidadTotalCalculada));
    const totalSemanaBase = Number(p.cantidadTotalCalculada) * riegos;
    return {
      productoId: p.productoId,
      nombreComercial: p.producto.nombreComercial,
      ingredienteActivo: p.producto.ingredienteActivo ?? "—",
      dosisValor: Number(p.dosisValor),
      unidadDosis: ETIQUETA_UNIDAD_DOSIS[p.dosisUnidad],
      porValvula,
      totalPorRiego,
      totalSemana: formatearCantidadProducto(p.dosisUnidad, totalSemanaBase),
    };
  });

  return {
    encabezado: {
      lote: fertirriego.huerta.nombre,
      semana: semanaDeFecha(fechaInicioISO),
      fecha: fechaInicioISO,
      valvulasDelLote: valvulas.length,
      receta: fertirriego.receta?.nombre ?? null,
      frecuencia: ETIQUETA_FRECUENCIA[fertirriego.frecuencia] ?? fertirriego.frecuencia,
      riegosEnLaSemana: riegos,
      hectareasTotales: Math.round(hectareasTotales * 100) / 100,
    },
    valvulas: valvulas.map((v) => ({ ...v, hectareas: Math.round(v.hectareas * 100) / 100 })),
    productos: productosTabla,
  };
}

export type OrdenFertirriego = Awaited<ReturnType<typeof construirOrdenFertirriego>>;
