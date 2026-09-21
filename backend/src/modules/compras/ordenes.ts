import { randomUUID } from "node:crypto";
import { calcularAhorroForaneo, calcularCotizacion } from "@cbf/shared";
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

// Editar Solicitudes manuales (8, V35, 17-sep-2026).
export class SolicitudNoEditableError extends Error {}
export class EdicionSolicitudNoPermitidaError extends Error {
  constructor() {
    super("Solo quien creó esta solicitud, o la persona de Compras, puede editarla.");
  }
}

export interface OrdenConProductoComercial {
  producto: { nombreComercial: string; ingredienteActivo: string | null; unidad: string };
  comparacionCotizacion: { productoComercial: { nombreComercial: string; ingredienteActivo: string | null; unidad: string } } | null;
}

/**
 * Bug real corregido (18-sep-2026, reportado por Diego): en PDF/tarjetas/
 * CxP/histórico de Proveedor se mostraba `orden.producto.nombreComercial`
 * — el producto "preferido" de la NECESIDAD original, no el Producto
 * Comercial que de verdad se cotizó y compró a ESE Proveedor (pueden ser
 * marcas distintas del mismo Ingrediente Activo — ej. pedir "ULTRASOL"
 * de SQM cuando en realidad se le compró "Microhow" a Greenhow). A propósito
 * NO se cambia `OrdenCompra.productoId` en sí (sigue siendo el producto de
 * la necesidad) — Almacén lo usa para emparejar de vuelta con la
 * Aplicación/Fertilización que generó la orden automática al recibirla
 * (ver `recibirOrden`, más abajo); cambiar productoId ahí rompería ese
 * emparejamiento cuando el Producto Comercial cotizado no coincide con el
 * producto original. Esto es puramente de PRESENTACIÓN: qué nombre
 * mostrarle al humano. Toda orden real (generada/recibida/cubierta)
 * siempre tiene `comparacionCotizacionId` (la única función que las crea,
 * `generarOrdenesDesdeAsignaciones`, siempre lo asigna) — el fallback a
 * `producto` es solo defensivo.
 */
export function productoRealDeOrden(orden: OrdenConProductoComercial) {
  return orden.comparacionCotizacion?.productoComercial ?? orden.producto;
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
    include: {
      producto: true,
      proveedor: true,
      recepciones: true,
      centroCosto: true,
      huertaDestino: true,
      comparacionCotizacion: { include: { productoComercial: true } },
    },
    orderBy: { fechaCreacion: "desc" },
  });

  const nombresUsuarios = await resolverNombresUsuarios([
    ...ordenes.map((o) => o.creadoPorId),
    ...ordenes.map((o) => o.canceladoPorId).filter((x): x is string => !!x),
  ]);
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
      // Cancelación de Orden ya generada (7, V35, 17-sep-2026) — distinto de
      // `motivoRechazo` (Solicitud manual rechazada antes de cotizar).
      canceladoPorNombre: orden.canceladoPorId ? nombresUsuarios.get(orden.canceladoPorId) ?? "—" : null,
      // Bug real corregido (18-sep-2026): el Producto Comercial de verdad
      // comprado a este Proveedor, no el de la necesidad -- ver
      // `productoRealDeOrden` arriba.
      productoReal: productoRealDeOrden(orden),
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

/** Monto por Proveedor en "Por Producto" (5, V35, 17-sep-2026) — ver comentario completo en listarPendientesPorIngredienteActivo. */
export interface ProveedorPendienteIngredienteActivo {
  proveedorId: string;
  proveedorNombre: string;
  totalSinFlete: number;
  totalConFlete: number;
  // Zona del comprador (6, "Comparativo General") — para distinguir Mejor
  // Global (el de menor Total con flete, cualquier Zona) de Mejor Local
  // (el de menor Total dentro de la Zona del comprador).
  esZonaComprador: boolean;
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
 *
 * Monto en dinero por Proveedor (5, V35, 17-sep-2026): junto al total de
 * cantidad pendiente, cada grupo trae `proveedores` — por cada Proveedor
 * que tiene cotizado este Ingrediente Activo (en cualquiera de las
 * necesidades que arman el total), cuánto costaría cubrir la
 * cantidadPendiente COMPLETA del grupo con él (Total sin flete/con flete),
 * para decidir a quién comprarle viendo el impacto en dinero, no solo el
 * precio unitario. Si tiene más de una cotización de este Ingrediente
 * Activo, se usa la más reciente (mismo criterio de precarga ya usado en
 * el Comparador). Mismo motor (`calcularCotizacion`) que ya usa el
 * Comparador y las tarjetas de "Por Proveedor" (4) — nada de cálculo nuevo.
 */
export async function listarPendientesPorIngredienteActivo() {
  // "generada" NUNCA es un estado de la necesidad misma (solo pasa por
  // pendiente_autorizar/pendiente_cotizar/cubierta) — es el estado de la
  // orden REAL que generarOrdenesDesdeAsignaciones crea aparte al cotizar
  // (Prioridad 1, 7-sep-2026). Incluirlo aquí colaba esa orden real como si
  // fuera su propia "necesidad" pendiente: como no tiene `comparacionOrigen`
  // (esa relación solo existe en la necesidad original), se contaba con su
  // cantidad completa sin restar nada — bug real, el producto seguía
  // apareciendo en Pendientes con el 100% aunque ya se hubiera generado la
  // orden de compra completa.
  const ordenes = await prisma.ordenCompra.findMany({
    where: { estado: { in: ["pendiente_autorizar", "pendiente_cotizar", "cubierta"] } },
    include: {
      producto: true,
      comparacionOrigen: { include: { cotizaciones: { include: { proveedor: true, zona: true } } } },
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
      // Monto por Proveedor (5) — cotización más reciente vista de cada
      // Proveedor para este Ingrediente Activo, a través de TODAS sus
      // necesidades; el total se calcula al final, ya con cantidadPendiente
      // completa del grupo (no se puede calcular a mitad del loop).
      cotizacionMasRecientePorProveedor: Map<
        string,
        {
          proveedorNombre: string;
          fechaCreacion: Date;
          moneda: "MXN" | "USD";
          precioValor: number;
          tipoCambio: number | null;
          presentacionCantidad: number;
          costoFleteKg: number;
          esZonaComprador: boolean;
        }
      >;
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
      grupo = {
        ingredienteActivo: etiqueta,
        categoria: orden.producto.categoria,
        unidad: orden.producto.unidad,
        cantidadPendiente: 0,
        ordenes: [],
        origenesMap: new Map(),
        cotizacionMasRecientePorProveedor: new Map(),
      };
      grupos.set(clave, grupo);
    }
    grupo.cantidadPendiente += cantidadPendiente;
    grupo.ordenes.push({ id: orden.id, estado: orden.estado, cantidadPendiente });

    for (const cot of orden.comparacionOrigen?.cotizaciones ?? []) {
      const actual = grupo.cotizacionMasRecientePorProveedor.get(cot.proveedorId);
      if (!actual || cot.fechaCreacion > actual.fechaCreacion) {
        grupo.cotizacionMasRecientePorProveedor.set(cot.proveedorId, {
          proveedorNombre: cot.proveedor.nombre,
          fechaCreacion: cot.fechaCreacion,
          moneda: cot.moneda,
          precioValor: Number(cot.precioValor),
          tipoCambio: cot.tipoCambio != null ? Number(cot.tipoCambio) : null,
          presentacionCantidad: Number(cot.presentacionCantidad),
          costoFleteKg: Number(cot.zona.costoFleteKg),
          esZonaComprador: cot.zona.esZonaComprador,
        });
      }
    }

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
    .map((g) => {
      const proveedores: ProveedorPendienteIngredienteActivo[] = [...g.cotizacionMasRecientePorProveedor.entries()]
        .map(([proveedorId, cot]) => {
          const calc = calcularCotizacion(g.cantidadPendiente, {
            moneda: cot.moneda,
            precioValor: cot.precioValor,
            tipoCambio: cot.tipoCambio,
            presentacionCantidad: cot.presentacionCantidad,
            costoFleteKg: cot.costoFleteKg,
          });
          return {
            proveedorId,
            proveedorNombre: cot.proveedorNombre,
            totalSinFlete: calc.precioTotalPresentaciones,
            totalConFlete: calc.totalConFlete,
            esZonaComprador: cot.esZonaComprador,
          };
        })
        .sort((a, b) => a.totalConFlete - b.totalConFlete);

      return {
        ingredienteActivo: g.ingredienteActivo,
        categoria: g.categoria,
        unidad: g.unidad,
        cantidadPendiente: g.cantidadPendiente,
        ordenes: g.ordenes,
        origenes: [...g.origenesMap.values()].sort((a, b) => b.cantidad - a.cantidad),
        proveedores,
      };
    })
    .sort((a, b) => a.ingredienteActivo.localeCompare(b.ingredienteActivo, "es"));
}

export interface FilaComparativoGeneral {
  ingredienteActivo: string;
  categoria: string;
  unidad: string;
  cantidadPendiente: number;
  ordenes: { id: string; estado: string; cantidadPendiente: number }[];
  proveedores: ProveedorPendienteIngredienteActivo[]; // ordenados de menor a mayor Total con flete -- proveedores[0] = Mejor Global
  mejorLocalId: string | null;
  ahorroForaneo: { monto: number; porcentaje: number } | null;
}

/**
 * "Comparativo General" (6, V35, 17-sep-2026) — vista de análisis que junta
 * TODOS los productos con cotizaciones abiertas en una sola tabla, a partir
 * del prototipo de Excel de Diego. Una fila por Ingrediente Activo, con
 * Mejor opción Global (con flete) vs. Mejor opción Local (Campeche, sin
 * flete) y el ahorro -- mismo motor ya existente
 * (listarPendientesPorIngredienteActivo + calcularAhorroForaneo, el mismo
 * que ya usa el Comparador individual), solo mostrado para todos los
 * productos a la vez. El cambio manual de Proveedor por fila (6.2) es
 * enteramente del frontend -- aquí solo se entrega `proveedores` completo
 * para que se pueda elegir cualquiera, no solo Global/Local.
 */
export async function listarComparativoGeneral(): Promise<FilaComparativoGeneral[]> {
  const grupos = await listarPendientesPorIngredienteActivo();
  return grupos
    .filter((g) => g.proveedores.length > 0)
    .map((g) => {
      const mejorGlobal = g.proveedores[0]!; // ya viene ordenado asc por totalConFlete
      const locales = g.proveedores.filter((p) => p.esZonaComprador);
      const mejorLocal = locales.length > 0 ? locales.reduce((a, b) => (b.totalConFlete < a.totalConFlete ? b : a)) : null;
      return {
        ingredienteActivo: g.ingredienteActivo,
        categoria: g.categoria,
        unidad: g.unidad,
        cantidadPendiente: g.cantidadPendiente,
        ordenes: g.ordenes,
        proveedores: g.proveedores,
        mejorLocalId: mejorLocal?.proveedorId ?? null,
        ahorroForaneo: calcularAhorroForaneo(mejorGlobal.totalConFlete, mejorLocal?.totalConFlete ?? null),
      };
    });
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
  // Trazabilidad de edición (8.3, V35, 17-sep-2026) -- el creador original
  // (solicitanteNombre, a nivel de grupo) nunca se pierde; esto es aparte,
  // solo se llena si alguien (el mismo Solicitante o Compras) la editó
  // después de creada.
  editadoPorNombre: string | null;
  fechaEdicion: string | null;
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
  // Título de la Solicitud manual (Prioridad 4, 7-sep-2026) — reemplaza el
  // genérico "Solicitud manual" en la tarjeta; null en automáticas y en
  // manuales creadas antes de este cambio (esas siguen mostrando el genérico).
  titulo: string | null;
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
  // Mismo bug/corrección que listarPendientesPorIngredienteActivo (Prioridad
  // 1, 7-sep-2026) — "generada" es exclusivo de la orden real, nunca de la
  // necesidad.
  const ordenes = await prisma.ordenCompra.findMany({
    where: { estado: { in: ["pendiente_autorizar", "pendiente_cotizar", "cubierta"] } },
    include: { producto: true, comparacionOrigen: true, centroCosto: true, huertaDestino: true },
    orderBy: { fechaCreacion: "desc" },
  });

  const nombresUsuarios = await resolverNombresUsuarios([
    ...ordenes.map((o) => o.creadoPorId),
    ...ordenes.map((o) => o.editadoPorId).filter((x): x is string => !!x),
  ]);
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

    // Título + multi-producto (Prioridad 4, 7-sep-2026): varias líneas de la
    // misma Solicitud manual comparten `solicitudManualId` — eso es lo que
    // las agrupa en una tarjeta en vez de una por producto. Una manual vieja
    // sin `solicitudManualId` (de antes de este cambio) sigue agrupándose
    // sola, como siempre.
    const clave = orden.referenciaAplicacionId ?? (orden.solicitudManualId ? `manual-grupo:${orden.solicitudManualId}` : `manual:${orden.id}`);
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
        titulo: orden.titulo,
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
      editadoPorNombre: orden.editadoPorId ? nombresUsuarios.get(orden.editadoPorId) ?? "—" : null,
      fechaEdicion: orden.fechaEdicion?.toISOString() ?? null,
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

export interface ProductoSolicitudManualInput {
  productoId: string;
  cantidadSolicitada: number;
}

export class SolicitudManualSinProductosError extends Error {
  constructor() {
    super("Agrega al menos un producto a la solicitud.");
  }
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
 *
 * Título + multi-producto (Prioridad 4, 7-sep-2026): una solicitud puede
 * pedir varios productos a la vez, cada uno con su propia cantidad — mismo
 * patrón "+ Otro producto" que Aplicaciones/Fertirriego. Cada producto
 * sigue siendo su propia fila de OrdenCompra (así ya funciona todo el resto
 * del sistema: cotizar/generar/recibir es por producto), pero todas
 * comparten un `solicitudManualId` generado aquí una sola vez — eso es lo
 * que las agrupa en una sola tarjeta con el Título en vez del genérico
 * "Solicitud manual" (ver listarPendientesPorProgramacion).
 */
export async function crearSolicitudManual(titulo: string, productosInput: ProductoSolicitudManualInput[], creadoPorId: string, destino: DestinoManualInput) {
  if (productosInput.length === 0) throw new SolicitudManualSinProductosError();
  const tieneCentroCosto = !!destino.centroCostoId;
  const tieneHuerta = !!destino.huertaDestinoId;
  if (tieneCentroCosto === tieneHuerta) throw new DestinoManualInvalidoError();

  const productos = await prisma.producto.findMany({ where: { id: { in: productosInput.map((p) => p.productoId) } } });
  for (const p of productos) {
    if (!p.autorizado) throw new ProductoNoAutorizadoError();
  }

  const solicitudManualId = randomUUID();
  return prisma.$transaction(
    productosInput.map((p) =>
      prisma.ordenCompra.create({
        data: {
          origen: "manual",
          productoId: p.productoId,
          cantidadSolicitada: p.cantidadSolicitada,
          estado: "pendiente_autorizar",
          creadoPorId,
          centroCostoId: destino.centroCostoId,
          huertaDestinoId: destino.huertaDestinoId,
          titulo,
          solicitudManualId,
        },
      })
    )
  );
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

export interface EditarSolicitudManualInput {
  titulo?: string;
  productoId?: string;
  cantidadSolicitada?: number;
}

/**
 * Editar una Solicitud manual (8, V35, 17-sep-2026). 8.1: el Solicitante
 * original O la persona de Compras (directo, sin pasar por el
 * Solicitante) — `puedeEditarComoCompras` ya viene resuelto por rol desde
 * la ruta (mismo criterio ROLES_ACCESO_UNIVERSAL/encargado_compras que
 * Prioridad 7), aquí solo se compara contra el creador original.
 *
 * Solo mientras la solicitud sigue "pendiente_autorizar"/"pendiente_cotizar"
 * -- una vez que tiene compra real (parcial o total) ya no se toca (causa
 * raíz: la Comparación fija `cantidadNecesaria` al crearse y nunca se
 * vuelve a tocar, ver comentario en el schema; cambiar cantidad/producto
 * después rompería esa cotización/compra ya hecha).
 *
 * 8.2: reautorización condicional -- si YA estaba autorizada
 * (pendiente_cotizar) y se edita CANTIDAD o PRODUCTO, regresa a
 * pendiente_autorizar (se limpia autorizadoPorId). Editar solo el Título
 * NO la reinicia.
 *
 * 8.3: `creadoPorId` nunca se toca (el creador original no se pierde);
 * `editadoPorId`/`fechaEdicion` se actualizan en cada edición, sea quien
 * sea que edite (incluido el propio Solicitante).
 *
 * Título es de la Solicitud completa, no de una línea -- varias filas
 * comparten `solicitudManualId` (ver crearSolicitudManual), así que un
 * cambio de Título se propaga a todas las filas del grupo. Cantidad/
 * Producto son por línea (cada producto de la solicitud es su propia fila
 * de OrdenCompra con su propio estado de autorización).
 */
export async function editarSolicitudManual(ordenId: string, editorId: string, puedeEditarComoCompras: boolean, cambios: EditarSolicitudManualInput) {
  const orden = await prisma.ordenCompra.findUnique({ where: { id: ordenId }, include: { comparacionOrigen: true } });
  if (!orden) throw new SolicitudNoEditableError("La solicitud no existe.");
  if (orden.origen !== "manual") throw new SolicitudNoEditableError("Solo las solicitudes manuales se editan aquí.");
  if (orden.estado !== "pendiente_autorizar" && orden.estado !== "pendiente_cotizar") {
    throw new SolicitudNoEditableError("Esta solicitud ya no se puede editar — ya tiene una compra real (parcial o total) o ya se cerró.");
  }
  if (editorId !== orden.creadoPorId && !puedeEditarComoCompras) throw new EdicionSolicitudNoPermitidaError();

  const cambiaCantidad = cambios.cantidadSolicitada != null && Number(cambios.cantidadSolicitada) !== Number(orden.cantidadSolicitada);
  const cambiaProducto = cambios.productoId != null && cambios.productoId !== orden.productoId;
  if ((cambiaCantidad || cambiaProducto) && orden.comparacionOrigen) {
    throw new SolicitudNoEditableError(
      "Ya tiene cotizaciones capturadas — no se puede cambiar cantidad ni producto (cancélala y crea una nueva solicitud si hace falta otro producto)."
    );
  }
  if (cambiaProducto) {
    const producto = await prisma.producto.findUniqueOrThrow({ where: { id: cambios.productoId! } });
    if (!producto.autorizado) throw new ProductoNoAutorizadoError();
  }

  return prisma.$transaction(async (tx) => {
    if (cambiaCantidad || cambiaProducto) {
      const dataFila: { productoId?: string; cantidadSolicitada?: number; editadoPorId: string; fechaEdicion: Date; estado?: "pendiente_autorizar"; autorizadoPorId?: null } = {
        editadoPorId: editorId,
        fechaEdicion: new Date(),
      };
      if (cambiaProducto) dataFila.productoId = cambios.productoId;
      if (cambiaCantidad) dataFila.cantidadSolicitada = cambios.cantidadSolicitada;
      if (orden.estado === "pendiente_cotizar") {
        dataFila.estado = "pendiente_autorizar";
        dataFila.autorizadoPorId = null;
      }
      await tx.ordenCompra.update({ where: { id: ordenId }, data: dataFila });
    }

    if (cambios.titulo !== undefined) {
      await tx.ordenCompra.updateMany({
        where: orden.solicitudManualId ? { solicitudManualId: orden.solicitudManualId } : { id: ordenId },
        data: { titulo: cambios.titulo, editadoPorId: editorId, fechaEdicion: new Date() },
      });
    }

    return tx.ordenCompra.findUniqueOrThrow({ where: { id: ordenId } });
  });
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
  presentacion: { contenedor: string; presentacionCantidad: number; numeroUnidades: number },
  recibidoPorId: string,
  opciones: { lote?: string; fechaCaducidad?: string; productoRecibidoId?: string } = {}
) {
  const orden = await prisma.ordenCompra.findUniqueOrThrow({ where: { id } });
  if (orden.estado !== "generada") throw new TransicionInvalidaError("generada");
  const productoRecibidoId = opciones.productoRecibidoId ?? orden.productoId;
  // El total nunca se captura suelto (Prioridad 2, 4-sep-2026) — siempre
  // Unidades × Cantidad por unidad de la Presentación con la que llegó.
  const cantidadRecibida = presentacion.numeroUnidades * presentacion.presentacionCantidad;

  return prisma.$transaction(async (tx) => {
    await tx.ordenCompra.update({ where: { id }, data: { estado: "recibida" } });
    await tx.ordenCompraRecepcion.create({
      data: {
        ordenId: id,
        contenedor: presentacion.contenedor,
        presentacionCantidad: presentacion.presentacionCantidad,
        numeroUnidades: presentacion.numeroUnidades,
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
      // Toda orden generada ya trae precio (lo fija la cotización elegida).
      precioUnitario: Number(orden.precioUnitario ?? 0),
      lote: opciones.lote,
      fechaCaducidad: opciones.fechaCaducidad,
      referenciaId: id,
      contenedor: presentacion.contenedor,
      presentacionCantidad: presentacion.presentacionCantidad,
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
