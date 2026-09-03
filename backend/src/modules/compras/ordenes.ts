import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
import { intentarComprometer, registrarEntradaTx } from "../almacen/movimientos.js";
import { calcularRiegosEnCampania } from "../fertilizantes/fertirriego.js";

export class SolicitudYaResueltaOrdenError extends Error {
  constructor() {
    super("Esta orden ya fue resuelta — probablemente por otro autorizador casi al mismo tiempo.");
  }
}

export class ProductoNoAutorizadoError extends Error {
  constructor() {
    super("Este producto todavía no está autorizado — no se puede comprar hasta que Dirección General/Gerente Técnico lo autorice.");
  }
}

export class TransicionInvalidaError extends Error {
  constructor(esperado: string) {
    super(`Esta orden no está en estado "${esperado}".`);
  }
}

/** Resuelve nombre de Usuario en lote — usado para "Solicitante" (Bloque 2, 2-sep-2026) en las tres vistas de Compras. */
async function resolverNombresUsuarios(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const usuarios = await prisma.usuario.findMany({ where: { id: { in: unicos } }, select: { id: true, nombre: true } });
  return new Map(usuarios.map((u) => [u.id, u.nombre]));
}

// Las "cancelada"/"rechazada" no se muestran por default — mismo criterio
// aplicado a Fertirriego/Granular/Aplicaciones (31-ago-2026): se ocultan
// de la lista activa pero no se borran (la trazabilidad de Almacén las
// sigue referenciando). Si se pide un `estado` específico (ej. el
// Comparador pidiendo `pendiente_cotizar`), ese filtro manda y
// `incluirCerradas` no aplica.
//
// Enriquecido (Bloque 2, 2-sep-2026) con Solicitante/Huerta de
// origen/Tipo de aplicación/fecha efectiva — mismos campos "mínimos
// comunes" que ya calculan `listarPendientesPorProgramacion` y
// `listarPendientesPorIngredienteActivo`, para que la vista "Por Orden" y
// las pestañas En Camino/Recibidas/Rechazadas-Canceladas puedan mostrar y
// filtrar igual que las demás.
export async function listarOrdenes(estado?: string, incluirCerradas?: boolean) {
  const ordenes = await prisma.ordenCompra.findMany({
    where: estado ? { estado: estado as never } : incluirCerradas ? {} : { estado: { notIn: ["cancelada", "rechazada"] } },
    include: { producto: true, proveedor: true, recepciones: true, centroCosto: true, huertaDestino: true },
    orderBy: { fechaCreacion: "desc" },
  });

  const nombresUsuarios = await resolverNombresUsuarios(ordenes.map((o) => o.creadoPorId));
  const cacheContexto = new Map<string, ContextoProgramacion>();

  const resultado = [];
  for (const orden of ordenes) {
    const cacheKey = orden.referenciaAplicacionId ?? "manual";
    let contexto = cacheContexto.get(cacheKey);
    if (!contexto) {
      contexto = await resolverProgramacion(orden.referenciaAplicacionId);
      cacheContexto.set(cacheKey, contexto);
    }
    resultado.push({
      ...orden,
      solicitanteNombre: nombresUsuarios.get(orden.creadoPorId) ?? "—",
      huertaOrigen: contexto.huertaId ? { id: contexto.huertaId, nombre: contexto.huertaNombre! } : null,
      tipoAplicacionId: contexto.tipoAplicacionId,
      tipoAplicacionNombre: contexto.tipoAplicacionNombre,
      fechaEfectiva: contexto.fechaInicio ?? orden.fechaCreacion.toISOString(),
    });
  }
  return resultado;
}

/**
 * Resuelve Huerta + Receta de origen de un `referenciaAplicacionId` para el
 * desglose por origen de `listarPendientesPorIngredienteActivo` (2.4,
 * 2-sep-2026) — mismo criterio "probar las tres en orden" que el resto de
 * este archivo. Fertilización Granular no maneja Receta (no tiene el campo
 * en el schema), así que ahí `recetaNombre` siempre queda null. `null` de
 * entrada (solicitud manual) no tiene ninguno de los dos.
 */
async function resolverOrigenHuertaReceta(
  referenciaAplicacionId: string | null
): Promise<{ huertaId: string | null; huertaNombre: string | null; recetaNombre: string | null }> {
  if (!referenciaAplicacionId) return { huertaId: null, huertaNombre: null, recetaNombre: null };
  const aplicacion = await prisma.aplicacion.findUnique({ where: { id: referenciaAplicacionId }, include: { huerta: true, receta: true } });
  if (aplicacion) return { huertaId: aplicacion.huertaId, huertaNombre: aplicacion.huerta.nombre, recetaNombre: aplicacion.receta?.nombre ?? null };
  const granular = await prisma.fertilizacionGranular.findUnique({ where: { id: referenciaAplicacionId }, include: { huerta: true } });
  if (granular) return { huertaId: granular.huertaId, huertaNombre: granular.huerta.nombre, recetaNombre: null };
  const fertirriego = await prisma.fertirriegoProgramacion.findUnique({ where: { id: referenciaAplicacionId }, include: { huerta: true, receta: true } });
  if (fertirriego) return { huertaId: fertirriego.huertaId, huertaNombre: fertirriego.huerta.nombre, recetaNombre: fertirriego.receta?.nombre ?? null };
  return { huertaId: null, huertaNombre: null, recetaNombre: null };
}

export interface OrigenPendienteIngredienteActivo {
  huertaId: string | null; // null = solicitud manual (2.4: sin Huerta/Receta, ver comentario abajo)
  huertaNombre: string | null;
  recetaNombre: string | null;
  esManual: boolean;
  cantidad: number;
}

/**
 * Compras agrupadas por Ingrediente Activo (2.1, 2-sep-2026): suma la
 * cantidad pendiente de cada Ingrediente Activo a través de TODAS las
 * órdenes "necesidad" pendientes (pendiente_autorizar/pendiente_cotizar,
 * más lo que le falte a una "generada"/"cubierta" parcialmente cotizada),
 * sin importar su origen — para comprar en volumen. No reemplaza la vista
 * por orden individual, coexisten (una es para urgencia puntual, la otra
 * para anticipar en volumen).
 *
 * Desglose por origen (2.4, 2-sep-2026): además del total, cada grupo trae
 * `origenes` — cuánto de ese total viene de cada combinación Huerta+Receta
 * ("Boro — 260 kg total: 160 kg (Huerta Sonrisas — Receta Frutal Boost),
 * 100 kg (Huerta Encanto — Receta Base)"), sumando entre sí todas las
 * órdenes que comparten exactamente la misma Huerta+Receta aunque vengan de
 * programaciones distintas. Fertilización Granular no usa Receta, así que
 * ahí el origen queda solo como "(Huerta X)". Solicitudes manuales no
 * tienen Huerta ni Receta — como esto no estaba definido y no hay que
 * detener el trabajo a preguntar, quedan agrupadas aparte con
 * `esManual: true` y se etiquetan en pantalla como "Solicitud manual"
 * (mismo criterio ya usado en la vista "Por Programación") — Diego debe
 * confirmar si esta etiqueta es la que quiere o si prefiere otra cosa.
 */
export async function listarPendientesPorIngredienteActivo() {
  const ordenes = await prisma.ordenCompra.findMany({
    where: { estado: { in: ["pendiente_autorizar", "pendiente_cotizar", "generada", "cubierta"] } },
    include: {
      producto: true,
      comparacionOrigen: { include: { cotizaciones: true } },
    },
  });

  const grupos = new Map<
    string,
    {
      ingredienteActivo: string;
      categoria: string;
      unidad: string;
      cantidadPendiente: number;
      ordenes: { id: string; estado: string; cantidadPendiente: number }[];
      origenesMap: Map<string, OrigenPendienteIngredienteActivo>;
    }
  >();
  const cacheOrigen = new Map<string, { huertaId: string | null; huertaNombre: string | null; recetaNombre: string | null }>();

  for (const orden of ordenes) {
    // "Necesidad" ya cotizada parcialmente (tiene Comparación ligada):
    // pendiente = cantidadNecesaria - ya comprado. Sin Comparación: toda
    // cantidadSolicitada sigue pendiente.
    let cantidadPendiente = Number(orden.cantidadSolicitada);
    if (orden.comparacionOrigen) {
      const ordenesReales = await prisma.ordenCompra.findMany({
        where: { comparacionCotizacion: { comparacionId: orden.comparacionOrigen.id }, estado: { in: ["generada", "recibida"] } },
      });
      const comprado = ordenesReales.reduce((s, o) => s + Number(o.cantidadSolicitada), 0);
      cantidadPendiente = Math.max(0, Number(orden.cantidadSolicitada) - comprado);
    }
    if (cantidadPendiente <= 0) continue;

    const clave = orden.producto.ingredienteActivo ?? `producto:${orden.producto.id}`;
    const etiqueta = orden.producto.ingredienteActivo ?? orden.producto.nombreComercial;
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = { ingredienteActivo: etiqueta, categoria: orden.producto.categoria, unidad: orden.producto.unidad, cantidadPendiente: 0, ordenes: [], origenesMap: new Map() };
      grupos.set(clave, grupo);
    }
    grupo.cantidadPendiente += cantidadPendiente;
    grupo.ordenes.push({ id: orden.id, estado: orden.estado, cantidadPendiente });

    const cacheKey = orden.referenciaAplicacionId ?? "manual";
    let origen = cacheOrigen.get(cacheKey);
    if (!origen) {
      origen = await resolverOrigenHuertaReceta(orden.referenciaAplicacionId);
      cacheOrigen.set(cacheKey, origen);
    }
    const esManual = !orden.referenciaAplicacionId;
    const origenClave = esManual ? "manual" : `${origen.huertaNombre ?? "?"} ${origen.recetaNombre ?? "?"}`;
    const origenExistente = grupo.origenesMap.get(origenClave);
    if (origenExistente) {
      origenExistente.cantidad += cantidadPendiente;
    } else {
      grupo.origenesMap.set(origenClave, {
        huertaId: origen.huertaId,
        huertaNombre: origen.huertaNombre,
        recetaNombre: origen.recetaNombre,
        esManual,
        cantidad: cantidadPendiente,
      });
    }
  }

  return [...grupos.values()]
    .map((g) => ({
      ingredienteActivo: g.ingredienteActivo,
      categoria: g.categoria,
      unidad: g.unidad,
      cantidadPendiente: g.cantidadPendiente,
      ordenes: g.ordenes,
      origenes: [...g.origenesMap.values()].sort((a, b) => b.cantidad - a.cantidad),
    }))
    .sort((a, b) => a.ingredienteActivo.localeCompare(b.ingredienteActivo, "es"));
}

export type EstadoLineaPendiente = "pendiente" | "cotizado" | "comprado_parcial";

export interface LineaPendienteProgramacion {
  ordenId: string;
  productoId: string;
  nombreComercial: string;
  ingredienteActivo: string | null;
  categoria: string;
  unidad: string;
  cantidadSolicitada: number;
  cantidadPendiente: number;
  estado: EstadoLineaPendiente;
  estadoOrden: string;
}

export interface DestinoPendienteProgramacion {
  tipo: "centro_costo" | "huerta";
  nombre: string;
}

export interface GrupoPendienteProgramacion {
  clave: string;
  tipo: "aplicacion" | "granular" | "fertirriego" | "manual" | "desconocido";
  referenciaId: string | null;
  huertaId: string | null;
  huertaNombre: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  tipoAplicacionId: string | null;
  tipoAplicacionNombre: string | null;
  // Campos mínimos comunes (Bloque 2, 2-sep-2026) — Solicitante/Fecha/Destino
  // ya resueltos aquí para que la tarjeta no tenga que ir a buscarlos aparte.
  solicitanteNombre: string;
  fecha: string;
  destino: DestinoPendienteProgramacion | null;
  lineas: LineaPendienteProgramacion[];
}

export interface ContextoProgramacion {
  clave: string;
  tipo: "aplicacion" | "granular" | "fertirriego" | "manual" | "desconocido";
  referenciaId: string | null;
  huertaId: string | null;
  huertaNombre: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  tipoAplicacionId: string | null;
  tipoAplicacionNombre: string | null;
}

/**
 * Resuelve a qué programación pertenece un `referenciaAplicacionId` (id
 * suelto sin FK real — puede apuntar a Aplicacion, FertilizacionGranular o
 * FertirriegoProgramacion, mismo criterio "probar las tres en orden" que
 * usa `recibirOrden`). `null` = solicitud manual, no ligada a programación.
 * "Tipo de aplicación" (Bloque 1, 2-sep-2026) solo existe en Aplicacion —
 * Granular/Fertirriego siempre devuelven null ahí, es correcto (9.7 es
 * exclusivo del proceso físico de Aplicaciones, ver FertirriegoProgramacion
 * en el schema).
 */
export async function resolverProgramacion(referenciaAplicacionId: string | null): Promise<ContextoProgramacion> {
  if (!referenciaAplicacionId) {
    return {
      clave: "",
      tipo: "manual",
      referenciaId: null,
      huertaId: null,
      huertaNombre: null,
      fechaInicio: null,
      fechaFin: null,
      tipoAplicacionId: null,
      tipoAplicacionNombre: null,
    };
  }
  const aplicacion = await prisma.aplicacion.findUnique({ where: { id: referenciaAplicacionId }, include: { huerta: true, tipoAplicacion: true } });
  if (aplicacion) {
    return {
      clave: referenciaAplicacionId,
      tipo: "aplicacion",
      referenciaId: referenciaAplicacionId,
      huertaId: aplicacion.huertaId,
      huertaNombre: aplicacion.huerta.nombre,
      fechaInicio: aplicacion.fechaInicio.toISOString(),
      fechaFin: aplicacion.fechaFin.toISOString(),
      tipoAplicacionId: aplicacion.tipoAplicacionId,
      tipoAplicacionNombre: aplicacion.tipoAplicacion?.nombre ?? null,
    };
  }
  const granular = await prisma.fertilizacionGranular.findUnique({ where: { id: referenciaAplicacionId }, include: { huerta: true } });
  if (granular) {
    return {
      clave: referenciaAplicacionId,
      tipo: "granular",
      referenciaId: referenciaAplicacionId,
      huertaId: granular.huertaId,
      huertaNombre: granular.huerta.nombre,
      fechaInicio: granular.fechaInicio.toISOString(),
      fechaFin: granular.fechaFin.toISOString(),
      tipoAplicacionId: null,
      tipoAplicacionNombre: null,
    };
  }
  const fertirriego = await prisma.fertirriegoProgramacion.findUnique({ where: { id: referenciaAplicacionId }, include: { huerta: true } });
  if (fertirriego) {
    return {
      clave: referenciaAplicacionId,
      tipo: "fertirriego",
      referenciaId: referenciaAplicacionId,
      huertaId: fertirriego.huertaId,
      huertaNombre: fertirriego.huerta.nombre,
      fechaInicio: fertirriego.fechaInicio.toISOString(),
      fechaFin: fertirriego.fechaFin.toISOString(),
      tipoAplicacionId: null,
      tipoAplicacionNombre: null,
    };
  }
  // Programación ya no existe (huérfana) — no debería pasar en flujo normal
  // (se cancela junto, ver cancelarOrdenesDeReferencia), pero no se pierde
  // la orden de la vista por eso, solo queda sin datos de programación.
  return {
    clave: referenciaAplicacionId,
    tipo: "desconocido",
    referenciaId: referenciaAplicacionId,
    huertaId: null,
    huertaNombre: null,
    fechaInicio: null,
    fechaFin: null,
    tipoAplicacionId: null,
    tipoAplicacionNombre: null,
  };
}

/**
 * Pendientes de cotizar agrupadas por PROGRAMACIÓN de origen (2.1, 2-sep-2026,
 * Bloque 2 de la reestructura): una tarjeta = una Aplicación/Fertirriego/
 * Fertilización Granular completa con todos sus productos adentro, o una
 * solicitud manual completa — a diferencia de `listarPendientesPorIngredienteActivo`
 * (que suma por Ingrediente Activo cruzando TODAS las programaciones), aquí
 * el agrupador es la programación misma, para cotizar/comprar todo lo que
 * necesita un mismo evento de una sola vez. Coexiste con las otras dos
 * vistas (por orden, por Ingrediente Activo), no las reemplaza.
 */
export async function listarPendientesPorProgramacion(): Promise<GrupoPendienteProgramacion[]> {
  const ordenes = await prisma.ordenCompra.findMany({
    where: { estado: { in: ["pendiente_autorizar", "pendiente_cotizar", "generada", "cubierta"] } },
    include: { producto: true, comparacionOrigen: true, centroCosto: true, huertaDestino: true },
    orderBy: { fechaCreacion: "desc" },
  });

  const nombresUsuarios = await resolverNombresUsuarios(ordenes.map((o) => o.creadoPorId));
  const grupos = new Map<string, GrupoPendienteProgramacion>();

  for (const orden of ordenes) {
    // Mismo criterio de "cuánto falta" que listarPendientesPorIngredienteActivo.
    let cantidadPendiente = Number(orden.cantidadSolicitada);
    let estadoLinea: EstadoLineaPendiente = "pendiente";
    if (orden.comparacionOrigen) {
      const ordenesReales = await prisma.ordenCompra.findMany({
        where: { comparacionCotizacion: { comparacionId: orden.comparacionOrigen.id }, estado: { in: ["generada", "recibida"] } },
      });
      const comprado = ordenesReales.reduce((s, o) => s + Number(o.cantidadSolicitada), 0);
      cantidadPendiente = Math.max(0, Number(orden.cantidadSolicitada) - comprado);
      estadoLinea = comprado > 0 ? "comprado_parcial" : "cotizado";
    }
    if (cantidadPendiente <= 0) continue;

    const clave = orden.referenciaAplicacionId ?? `manual:${orden.id}`;
    let grupo = grupos.get(clave);
    if (!grupo) {
      const base = await resolverProgramacion(orden.referenciaAplicacionId);
      // Destino (Bloque 2/3, 2-sep-2026): en automáticas ya está implícito
      // en la Huerta de la programación; en manuales, el Centro de
      // Costo/Huerta que se capturó al crear la solicitud (4.1).
      const destino: DestinoPendienteProgramacion | null =
        base.tipo === "manual"
          ? orden.centroCosto
            ? { tipo: "centro_costo", nombre: orden.centroCosto.nombre }
            : orden.huertaDestino
              ? { tipo: "huerta", nombre: orden.huertaDestino.nombre }
              : null
          : base.huertaNombre
            ? { tipo: "huerta", nombre: base.huertaNombre }
            : null;
      grupo = {
        ...base,
        clave,
        solicitanteNombre: nombresUsuarios.get(orden.creadoPorId) ?? "—",
        fecha: base.fechaInicio ?? orden.fechaCreacion.toISOString(),
        destino,
        lineas: [],
      };
      grupos.set(clave, grupo);
    }
    grupo.lineas.push({
      ordenId: orden.id,
      productoId: orden.productoId,
      nombreComercial: orden.producto.nombreComercial,
      ingredienteActivo: orden.producto.ingredienteActivo,
      categoria: orden.producto.categoria,
      unidad: orden.producto.unidad,
      cantidadSolicitada: Number(orden.cantidadSolicitada),
      cantidadPendiente,
      estado: estadoLinea,
      estadoOrden: orden.estado,
    });
  }

  return [...grupos.values()];
}

export class DestinoManualInvalidoError extends Error {
  constructor() {
    super("Elige un Destino para la solicitud — Centro de Costo o Huerta, es obligatorio.");
  }
}

export interface DestinoManualInput {
  centroCostoId?: string;
  huertaDestinoId?: string;
}

/**
 * Solicitud manual (9.14) — nunca ligada a una Aplicación (eso son las
 * automáticas, que llegan cuando exista Aplicaciones/Fertilizantes).
 * Regla dura: si el producto es agroquímico/fertilizante, debe estar ya
 * autorizado antes de poder comprarse, no solo antes de aplicarse.
 *
 * Destino (4.1, 2-sep-2026): obligatorio, exactamente uno de los dos — un
 * Centro de Costo del catálogo abierto, o una Huerta específica (cuando el
 * gasto se debe cargar directo a una Huerta, no a un centro de costo
 * general). Las órdenes automáticas no pasan por aquí — su destino ya está
 * implícito en la Huerta de la programación que las generó.
 */
export async function crearOrdenManual(productoId: string, cantidadSolicitada: number, creadoPorId: string, destino: DestinoManualInput) {
  const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
  if (!producto.autorizado) throw new ProductoNoAutorizadoError();
  const tieneCentroCosto = !!destino.centroCostoId;
  const tieneHuerta = !!destino.huertaDestinoId;
  if (tieneCentroCosto === tieneHuerta) throw new DestinoManualInvalidoError();

  return prisma.ordenCompra.create({
    data: {
      origen: "manual",
      productoId,
      cantidadSolicitada,
      estado: "pendiente_autorizar",
      creadoPorId,
      centroCostoId: destino.centroCostoId,
      huertaDestinoId: destino.huertaDestinoId,
    },
  });
}

/** "Primero en llegar gana" (bloque 4) — igual que el resto de autorizaciones del sistema. */
export async function autorizarOrden(id: string, autorizadoPorId: string) {
  const actualizadas = await prisma.ordenCompra.updateMany({
    where: { id, estado: "pendiente_autorizar" },
    data: { estado: "pendiente_cotizar", autorizadoPorId },
  });
  if (actualizadas.count === 0) throw new SolicitudYaResueltaOrdenError();
  return prisma.ordenCompra.findUniqueOrThrow({ where: { id } });
}

export async function rechazarOrden(id: string, autorizadoPorId: string, motivoRechazo?: string) {
  const actualizadas = await prisma.ordenCompra.updateMany({
    where: { id, estado: "pendiente_autorizar" },
    data: { estado: "rechazada", autorizadoPorId, motivoRechazo },
  });
  if (actualizadas.count === 0) throw new SolicitudYaResueltaOrdenError();
  return prisma.ordenCompra.findUniqueOrThrow({ where: { id } });
}

/**
 * Cancela toda orden de compra ligada a una programación que se acaba de
 * cancelar/liberar (1.5, 2-sep-2026) — sin importar si ya se cotizó o ya
 * se formalizó/generó con un Proveedor (`generada`), mientras el producto
 * todavía no haya llegado a Almacén (`recibida` nunca se toca). Cubre
 * tanto la orden "necesidad" original como cualquier orden real generada
 * parcialmente desde el Comparador (ambas comparten `referenciaAplicacionId`).
 * Debe llamarse DENTRO de la misma transacción que cancela la programación.
 */
export async function cancelarOrdenesDeReferencia(tx: TransactionClient, referenciaAplicacionId: string) {
  await tx.ordenCompra.updateMany({
    where: { referenciaAplicacionId, estado: { in: ["pendiente_autorizar", "pendiente_cotizar", "generada", "cubierta"] } },
    data: { estado: "cancelada" },
  });
}

/** CxP (9.14): botón manual — no hay conciliación bancaria automática, Gerencia confirma que ya se pagó. */
export function marcarOrdenPagada(id: string) {
  return prisma.ordenCompra.update({ where: { id }, data: { pagada: true, fechaPago: new Date() } });
}

/**
 * Recepción flexible (9.14/9.15): lo recibido no siempre coincide con lo
 * pedido — se registra la cantidad real. Esto es lo que de verdad mueve el
 * inventario: llama al mismo mecanismo de entrada que usa Almacén
 * directamente, para que no haya dos formas distintas de "entrar" stock.
 *
 * Confirmar producto recibido (2.3, 2-sep-2026): `productoRecibidoId` es
 * el producto que de verdad llegó — el pedido, el preferido, o un
 * sustituto autorizado (ver almacen/preferencias.ts). La entrada de
 * inventario SIEMPRE se registra bajo el producto que de verdad llegó
 * (físicamente correcto). Si es distinto del producto pedido y esta orden
 * viene de una programación en espera (Aplicación/Granular/Fertirriego):
 * por decisión de Diego (2-sep-2026) un sustituto autorizado SÍ cumple la
 * programación de origen con la misma cantidad ya calculada — para que
 * eso funcione de verdad en todo el sistema (alertas de "comprometido",
 * Riego, notificaciones, etc., todas siguen el productoId de la fila de
 * la programación), se actualiza esa fila para que apunte al sustituto
 * ANTES de comprometer stock — no se compromete el producto viejo con
 * stock del sustituto (eso sí dejaría el historial de Almacén
 * inconsistente: un movimiento de salida de un producto que en realidad
 * nunca se movió).
 */
export async function recibirOrden(
  id: string,
  cantidadRecibida: number,
  recibidoPorId: string,
  opciones: { lote?: string; fechaCaducidad?: string; productoRecibidoId?: string } = {}
) {
  const orden = await prisma.ordenCompra.findUniqueOrThrow({ where: { id } });
  if (orden.estado !== "generada") throw new TransicionInvalidaError("generada");
  const productoRecibidoId = opciones.productoRecibidoId ?? orden.productoId;

  return prisma.$transaction(async (tx) => {
    await tx.ordenCompra.update({ where: { id }, data: { estado: "recibida" } });
    await tx.ordenCompraRecepcion.create({
      data: {
        ordenId: id,
        cantidadRecibida,
        lote: opciones.lote,
        fechaCaducidad: opciones.fechaCaducidad ? new Date(opciones.fechaCaducidad) : undefined,
        recibidoPorId,
        productoRecibidoId,
      },
    });
    // Misma transacción que el resto de la recepción — si algo falla
    // después, la entrada de inventario también se revierte. Siempre bajo
    // el producto que de verdad llegó, sea el pedido o un sustituto.
    await registrarEntradaTx(tx, productoRecibidoId, cantidadRecibida, recibidoPorId, {
      lote: opciones.lote,
      fechaCaducidad: opciones.fechaCaducidad,
      referenciaId: id,
    });

    // Si esta orden nació automática porque una Aplicación/Fertilización en
    // espera no alcanzaba stock (9.5/9.7/9.14), al recibirla se intenta
    // apartar de inmediato la cantidad que necesita — misma transacción,
    // para que la entrada y el apartado queden atómicos. referenciaId puede
    // apuntar a cualquiera de los tres orígenes; se prueban en orden.
    if (orden.referenciaAplicacionId) {
      const refId = orden.referenciaAplicacionId;
      // Varios productos por programación (10-ago-2026): la cantidad a
      // comprometer es la de ESTE producto específico dentro de la
      // Aplicación/Fertilización/Fertirriego, no la de toda la programación.
      //
      // Busca por `orden.productoId` O `productoRecibidoId` (2-sep-2026):
      // una necesidad se puede cubrir con VARIAS órdenes parciales — si la
      // primera ya confirmó un sustituto, la fila de la programación
      // queda apuntando a ese sustituto, y una segunda orden parcial
      // (cuyo `orden.productoId` todavía dice el producto pedido
      // original) ya no la encontraría buscando solo por ese id.
      const productoIds = productoRecibidoId === orden.productoId ? [orden.productoId] : [orden.productoId, productoRecibidoId];
      const aplicacionProducto = await tx.aplicacionProducto.findFirst({ where: { aplicacionId: refId, productoId: { in: productoIds } } });
      if (aplicacionProducto) {
        if (aplicacionProducto.productoId !== productoRecibidoId) {
          await tx.aplicacionProducto.update({ where: { id: aplicacionProducto.id }, data: { productoId: productoRecibidoId } });
        }
        await intentarComprometer(tx, productoRecibidoId, Number(aplicacionProducto.cantidadTotalCalculada), refId, recibidoPorId);
      } else {
        const granularProducto = await tx.fertilizacionGranularProducto.findFirst({ where: { fertilizacionId: refId, productoId: { in: productoIds } } });
        if (granularProducto) {
          if (granularProducto.productoId !== productoRecibidoId) {
            await tx.fertilizacionGranularProducto.update({ where: { id: granularProducto.id }, data: { productoId: productoRecibidoId } });
          }
          await intentarComprometer(tx, productoRecibidoId, Number(granularProducto.cantidadTotalCalculada), refId, recibidoPorId);
        } else {
          const fertirriegoProducto = await tx.fertirriegoProgramacionProducto.findFirst({ where: { fertirriegoId: refId, productoId: { in: productoIds } } });
          if (fertirriegoProducto) {
            if (fertirriegoProducto.productoId !== productoRecibidoId) {
              await tx.fertirriegoProgramacionProducto.update({ where: { id: fertirriegoProducto.id }, data: { productoId: productoRecibidoId } });
            }
            // Fertirriego comprometió/pidió el total de CAMPAÑA, no el de
            // una ocasión (2-sep-2026, ver fertirriego.ts) — este apartado
            // al recibir tiene que usar la misma base o se queda corto y
            // luego "confirmar entrega" mueve más de lo que en realidad se
            // apartó, descuadrando Almacén Central contra Almacén Local.
            const fertirriego = await tx.fertirriegoProgramacion.findUniqueOrThrow({ where: { id: refId } });
            const riegosCampania = calcularRiegosEnCampania(fertirriego);
            await intentarComprometer(tx, productoRecibidoId, Number(fertirriegoProducto.cantidadTotalCalculada) * riegosCampania, refId, recibidoPorId);
          }
        }
      }
    }
    return tx.ordenCompra.findUniqueOrThrow({ where: { id } });
  });
}
