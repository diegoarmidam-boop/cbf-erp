import { calcularCotizacion } from "@cbf/shared";
import { prisma } from "../../core/db.js";
import { siguienteFolio } from "../../core/contador.js";
import { obtenerComparacionCalculada } from "./comparador.js";
import { resolverProgramacion } from "./ordenes.js";

/**
 * Pestaña "Órdenes de Compra" (3-sep-2026, Prioridad 1) — el único lugar
 * donde de verdad se arma y genera una orden de compra real. "Cotizar" +
 * "Generar orden de compra" desde Pendientes ya NO genera nada directo,
 * manda aquí (ver Ordenes.tsx/Comparador.tsx). Reutiliza toda la captura de
 * cotizaciones que ya existe en el Comparador (comparador.ts) — esta
 * pantalla es puramente de ASIGNACIÓN (qué cotización cubre qué necesidad,
 * y cuánto) y GENERACIÓN (agrupar por Proveedor resultante y crear las
 * órdenes reales, una por línea de origen, compartiendo folio dentro del
 * mismo grupo de Proveedor — ver comentario en el schema, OrdenCompra.numero).
 */

export interface LineaOrigenCotizacion {
  cotizacionId: string;
  proveedorId: string;
  proveedorNombre: string;
  nombreComercial: string;
  precioUnitarioMXN: number;
  cantidadDisponibleTotal: boolean;
  cantidadDisponible: number | null;
  cantidadYaUsada: number;
  esPreferido: boolean;
  esSustituto: boolean;
}

export interface LineaOrigenNecesidad {
  ordenCompraId: string;
  comparacionId: string;
  productoId: string;
  nombreComercial: string;
  ingredienteActivo: string | null;
  unidad: string;
  cantidadPendiente: number;
  origenLabel: string;
  fecha: string | null;
  cotizaciones: LineaOrigenCotizacion[];
}

/** Resuelve preferido/sustituto por lote (1.1) — evita N+1 al armar varias líneas del mismo Ingrediente Activo. */
async function resolverPreferenciasPorIngrediente(nombresIngrediente: string[]) {
  const unicos = [...new Set(nombresIngrediente.filter((n): n is string => !!n))];
  if (unicos.length === 0) return new Map<string, { preferidoId: string | null; sustitutoIds: Set<string> }>();
  const ingredientes = await prisma.ingredienteActivo.findMany({
    where: { nombre: { in: unicos } },
    include: { sustitutos: true },
  });
  return new Map(
    ingredientes.map((ing) => [ing.nombre, { preferidoId: ing.productoPreferidoId, sustitutoIds: new Set(ing.sustitutos.map((s) => s.productoId)) }])
  );
}

/** Resuelve "cuánto ya se generó" por cotización (lote) — usado para armar `cantidadYaUsada` en cada línea que se le muestra al usuario. */
async function resolverCantidadYaUsadaPorCotizacion(cotizacionIds: string[]) {
  if (cotizacionIds.length === 0) return new Map<string, number>();
  const ordenes = await prisma.ordenCompra.findMany({
    where: { comparacionCotizacionId: { in: cotizacionIds }, estado: { in: ["generada", "recibida"] } },
    select: { comparacionCotizacionId: true, cantidadSolicitada: true },
  });
  const mapa = new Map<string, number>();
  for (const o of ordenes) {
    const clave = o.comparacionCotizacionId!;
    mapa.set(clave, (mapa.get(clave) ?? 0) + Number(o.cantidadSolicitada));
  }
  return mapa;
}

/**
 * Tope de Cantidad disponible (1.5) — por Proveedor+Producto EN CONJUNTO,
 * no por cotización aislada (decisión de Diego, 3-sep-2026): el mismo
 * Proveedor+Producto puede haberse cotizado por separado en varias
 * necesidades de origen distinto (cada una con su propia captura de
 * "disponible") — el disponible real del Proveedor es uno solo, así que se
 * agrupan TODAS las cotizaciones de ese Proveedor+Producto (existan o no en
 * esta tanda) y se compara contra la cotización MÁS RECIENTE de ese par (el
 * dato más actualizado que el Proveedor haya dado) — mismo criterio que
 * usar la última captura como la vigente cuando hay varias.
 */
async function resolverTopePorProveedorProducto(proveedorProductoPares: { proveedorId: string; productoId: string }[]) {
  const resultado = new Map<
    string,
    { cantidadDisponibleTotal: boolean; cantidadDisponible: number | null; yaUsada: number; cotizacionIds: string[] }
  >();
  for (const { proveedorId, productoId } of proveedorProductoPares) {
    const clave = `${proveedorId}|${productoId}`;
    if (resultado.has(clave)) continue;

    const cotizacionesDelPar = await prisma.comparacionCotizacion.findMany({
      where: { proveedorId, comparacion: { productoId } },
      orderBy: { fechaCreacion: "desc" },
    });
    if (cotizacionesDelPar.length === 0) continue;

    const masReciente = cotizacionesDelPar[0]!;
    const cotizacionIds = cotizacionesDelPar.map((c) => c.id);
    const yaUsadaPorCotizacion = await resolverCantidadYaUsadaPorCotizacion(cotizacionIds);
    const yaUsada = [...yaUsadaPorCotizacion.values()].reduce((s, v) => s + v, 0);

    resultado.set(clave, {
      cantidadDisponibleTotal: masReciente.cantidadDisponibleTotal,
      cantidadDisponible: masReciente.cantidadDisponible != null ? Number(masReciente.cantidadDisponible) : null,
      yaUsada,
      cotizacionIds,
    });
  }
  return resultado;
}

/**
 * Arma las líneas de origen para un conjunto de necesidades (OrdenCompra
 * "pendiente_cotizar"/"cubierta" con saldo) que YA tienen Comparación —
 * las que no se han cotizado todavía simplemente no aparecen aquí (esta
 * pantalla es de asignación, no de captura de cotización).
 */
async function armarLineasDeNecesidades(ordenIds: string[]): Promise<LineaOrigenNecesidad[]> {
  if (ordenIds.length === 0) return [];
  const necesidades = await prisma.ordenCompra.findMany({
    where: { id: { in: ordenIds } },
    include: { producto: true, comparacionOrigen: true },
  });

  const conComparacion = necesidades.filter((n) => n.comparacionOrigen);
  const calculadas = await Promise.all(conComparacion.map((n) => obtenerComparacionCalculada(n.comparacionOrigen!.id)));

  const nombresIngrediente = conComparacion.map((n) => n.producto.ingredienteActivo).filter((x): x is string => !!x);
  const preferencias = await resolverPreferenciasPorIngrediente(nombresIngrediente);
  const todasCotizacionIds = calculadas.flatMap((c) => c?.cotizaciones.map((cot) => cot.id) ?? []);
  const yaUsadaPorCotizacion = await resolverCantidadYaUsadaPorCotizacion(todasCotizacionIds);

  const lineas: LineaOrigenNecesidad[] = [];
  for (let i = 0; i < conComparacion.length; i++) {
    const necesidad = conComparacion[i]!;
    const calc = calculadas[i];
    if (!calc || calc.cantidadPendiente <= 0) continue;

    const contexto = await resolverProgramacion(necesidad.referenciaAplicacionId);
    const origenLabel = contexto.tipo === "manual" ? "(Solicitud manual)" : `${contexto.huertaNombre ?? "?"} — ${TIPO_LABEL[contexto.tipo]}`;
    const pref = necesidad.producto.ingredienteActivo ? preferencias.get(necesidad.producto.ingredienteActivo) : undefined;

    lineas.push({
      ordenCompraId: necesidad.id,
      comparacionId: necesidad.comparacionOrigen!.id,
      productoId: necesidad.productoId,
      nombreComercial: necesidad.producto.nombreComercial,
      ingredienteActivo: necesidad.producto.ingredienteActivo,
      unidad: necesidad.producto.unidad,
      cantidadPendiente: calc.cantidadPendiente,
      origenLabel,
      fecha: contexto.fechaInicio ?? necesidad.fechaCreacion.toISOString(),
      cotizaciones: calc.cotizaciones.map((cot) => ({
        cotizacionId: cot.id,
        proveedorId: cot.proveedor.id,
        proveedorNombre: cot.proveedor.nombre,
        nombreComercial: cot.nombreComercial,
        precioUnitarioMXN: cot.precioUnitarioMXN,
        cantidadDisponibleTotal: cot.cantidadDisponibleTotal,
        cantidadDisponible: cot.cantidadDisponible,
        cantidadYaUsada: yaUsadaPorCotizacion.get(cot.id) ?? 0,
        esPreferido: pref?.preferidoId === necesidad.productoId,
        esSustituto: pref?.sustitutoIds.has(necesidad.productoId) ?? false,
      })),
    });
  }
  return lineas;
}

const TIPO_LABEL: Record<string, string> = {
  aplicacion: "Aplicación",
  granular: "Fertilización Granular",
  fertirriego: "Fertirriego",
  desconocido: "Programación",
};

/** Entrada "Por Programación" (1.1, "Por Orden" en el documento — una orden = una programación completa, o una solicitud manual). */
export async function listarPorProgramacion(referenciaAplicacionId: string | null, ordenCompraIdManual: string | null): Promise<LineaOrigenNecesidad[]> {
  const ids = referenciaAplicacionId
    ? (
        await prisma.ordenCompra.findMany({
          where: { referenciaAplicacionId, estado: { in: ["pendiente_cotizar", "cubierta"] } },
          select: { id: true },
        })
      ).map((o) => o.id)
    : [ordenCompraIdManual ?? ""];
  return armarLineasDeNecesidades(ids);
}

/** Entrada "Por Producto" — todas las necesidades pendientes de ese Ingrediente Activo (o producto sin IA) en toda la empresa. */
export async function listarPorProducto(ingredienteActivoOProductoId: string): Promise<LineaOrigenNecesidad[]> {
  const ids = (
    await prisma.ordenCompra.findMany({
      where: {
        estado: { in: ["pendiente_cotizar", "cubierta"] },
        producto: { OR: [{ ingredienteActivo: ingredienteActivoOProductoId }, { id: ingredienteActivoOProductoId }] },
      },
      select: { id: true },
    })
  ).map((o) => o.id);
  return armarLineasDeNecesidades(ids);
}

/** Entrada "Por Proveedor" — todas las necesidades pendientes que ya tienen al menos una cotización de ese Proveedor. */
export async function listarPorProveedor(proveedorId: string): Promise<LineaOrigenNecesidad[]> {
  const comparacionIds = (
    await prisma.comparacionCotizacion.findMany({ where: { proveedorId }, select: { comparacionId: true }, distinct: ["comparacionId"] })
  ).map((c) => c.comparacionId);
  const ids = (
    await prisma.ordenCompra.findMany({
      where: { estado: { in: ["pendiente_cotizar", "cubierta"] }, comparacionOrigen: { id: { in: comparacionIds } } },
      select: { id: true },
    })
  ).map((o) => o.id);
  // Solo las cotizaciones de ESTE proveedor interesan aquí — se filtran las
  // líneas para no mostrar cotizaciones de otros proveedores que también
  // hayan cotizado la misma necesidad (ruido para esta vista específica).
  const lineas = await armarLineasDeNecesidades(ids);
  return lineas
    .map((l) => ({ ...l, cotizaciones: l.cotizaciones.filter((c) => c.proveedorId === proveedorId) }))
    .filter((l) => l.cotizaciones.length > 0);
}

export interface AsignacionInput {
  cotizacionId: string;
  ordenCompraId: string; // necesidad de origen a la que aplica esta cantidad
  cantidad: number;
}

export interface VistaPreviaProveedor {
  proveedorId: string;
  proveedorNombre: string;
  lineas: { productoId: string; nombreComercial: string; unidad: string; cantidad: number; precioUnitarioMXN: number; importe: number }[];
  total: number;
}

export class AsignacionInvalidaError extends Error {}
export class TopeDisponibleExcedidoError extends Error {
  constructor(public detalle: { cotizacionId: string; proveedorNombre: string; nombreComercial: string; disponible: number; asignado: number }[]) {
    super(
      "La cantidad asignada supera lo disponible del Proveedor en " +
        detalle.length +
        " cotización(es) — ajusta manualmente cuánto de cada línea entra antes de generar."
    );
  }
}

/**
 * Valida una tanda de asignaciones SIN escribir nada — usado para la vista
 * previa (1.2) y para el tope de disponible (1.5) antes de dejar generar.
 * Agrupa por Proveedor resultante y calcula el total que se va a generar.
 */
export async function validarYAgruparAsignaciones(asignaciones: AsignacionInput[]): Promise<VistaPreviaProveedor[]> {
  if (asignaciones.length === 0) throw new AsignacionInvalidaError("No hay ninguna asignación que generar.");
  for (const a of asignaciones) {
    if (a.cantidad <= 0) throw new AsignacionInvalidaError("La cantidad de cada línea debe ser mayor a cero.");
  }

  const cotizacionIds = [...new Set(asignaciones.map((a) => a.cotizacionId))];
  const cotizaciones = await prisma.comparacionCotizacion.findMany({
    where: { id: { in: cotizacionIds } },
    include: { proveedor: true, zona: true, comparacion: { include: { producto: true, ordenCompra: true } } },
  });
  const cotizacionPorId = new Map(cotizaciones.map((c) => [c.id, c]));

  // Tope de Cantidad disponible por Proveedor+Producto EN CONJUNTO (1.5,
  // decisión de Diego 3-sep-2026) — no por cotización aislada, ver
  // `resolverTopePorProveedorProducto`.
  const pares = cotizaciones.map((c) => ({ proveedorId: c.proveedorId, productoId: c.comparacion.productoId }));
  const topesPorPar = await resolverTopePorProveedorProducto(pares);
  const nuevoPorPar = new Map<string, number>();
  for (const a of asignaciones) {
    const cot = cotizacionPorId.get(a.cotizacionId);
    if (!cot) throw new AsignacionInvalidaError("Una de las cotizaciones asignadas ya no existe.");
    const clave = `${cot.proveedorId}|${cot.comparacion.productoId}`;
    nuevoPorPar.set(clave, (nuevoPorPar.get(clave) ?? 0) + a.cantidad);
  }
  const excedidas: { cotizacionId: string; proveedorNombre: string; nombreComercial: string; disponible: number; asignado: number }[] = [];
  for (const [clave, nuevaCantidad] of nuevoPorPar) {
    const tope = topesPorPar.get(clave);
    if (!tope || tope.cantidadDisponibleTotal) continue;
    const disponible = tope.cantidadDisponible ?? 0;
    const totalConEsto = tope.yaUsada + nuevaCantidad;
    if (totalConEsto > disponible + 0.0001) {
      const [proveedorId] = clave.split("|");
      const cotRef = cotizaciones.find((c) => c.proveedorId === proveedorId);
      excedidas.push({
        cotizacionId: cotRef?.id ?? clave,
        proveedorNombre: cotRef?.proveedor.nombre ?? "—",
        nombreComercial: cotRef?.nombreComercial ?? "—",
        disponible,
        asignado: totalConEsto,
      });
    }
  }
  if (excedidas.length > 0) throw new TopeDisponibleExcedidoError(excedidas);

  // Tope contra lo pendiente de cada necesidad de origen (por si se
  // reparte la misma necesidad entre 2+ cotizaciones distintas).
  const necesidadIds = [...new Set(asignaciones.map((a) => a.ordenCompraId))];
  const comparacionesPorNecesidad = new Map(cotizaciones.map((c) => [c.comparacion.ordenCompra?.id, c.comparacion]));
  for (const necesidadId of necesidadIds) {
    const comparacion = comparacionesPorNecesidad.get(necesidadId);
    if (!comparacion) continue;
    const calc = await obtenerComparacionCalculada(comparacion.id);
    if (!calc) continue;
    const pedidoDeEstaNecesidad = asignaciones.filter((a) => a.ordenCompraId === necesidadId).reduce((s, a) => s + a.cantidad, 0);
    if (pedidoDeEstaNecesidad > calc.cantidadPendiente + 0.0001) {
      throw new AsignacionInvalidaError(
        `${calc.producto.nombreComercial}: se está asignando ${pedidoDeEstaNecesidad.toFixed(3)} ${calc.unidad} pero solo hay ${calc.cantidadPendiente.toFixed(3)} pendiente.`
      );
    }
  }

  // Agrupación automática por Proveedor resultante (1.2).
  const porProveedor = new Map<string, VistaPreviaProveedor>();
  for (const a of asignaciones) {
    const cot = cotizacionPorId.get(a.cotizacionId)!;
    const calc = calcularCotizacion(a.cantidad, {
      moneda: cot.moneda,
      precioValor: Number(cot.precioValor),
      tipoCambio: cot.tipoCambio != null ? Number(cot.tipoCambio) : null,
      presentacionCantidad: Number(cot.presentacionCantidad),
      costoFleteKg: 0, // vista previa a nivel de importe de producto; el flete ya se decidió al elegir la cotización
    });
    const importe = a.cantidad * calc.precioUnitarioMXN;

    let grupo = porProveedor.get(cot.proveedorId);
    if (!grupo) {
      grupo = { proveedorId: cot.proveedorId, proveedorNombre: cot.proveedor.nombre, lineas: [], total: 0 };
      porProveedor.set(cot.proveedorId, grupo);
    }
    // Detalle en pantalla vs. PDF final (1.3): aquí, en la vista previa que
    // antecede al PDF, YA se suman las líneas del mismo producto+proveedor
    // que vienen de orígenes distintos — es justo el resultado que va a
    // salir en el PDF. Las líneas separadas por origen se ven ANTES, en la
    // pantalla de asignación (armarLineasDeNecesidades), no aquí.
    const existente = grupo.lineas.find((l) => l.productoId === cot.comparacion.productoId);
    if (existente) {
      existente.cantidad += a.cantidad;
      existente.importe += importe;
    } else {
      grupo.lineas.push({
        productoId: cot.comparacion.productoId,
        nombreComercial: cot.comparacion.producto.nombreComercial,
        unidad: cot.comparacion.unidad,
        cantidad: a.cantidad,
        precioUnitarioMXN: calc.precioUnitarioMXN,
        importe,
      });
    }
    grupo.total += importe;
  }

  return [...porProveedor.values()];
}

/**
 * Genera las órdenes reales (1.2-1.5): agrupa por Proveedor resultante,
 * UN folio por Proveedor (compartido entre todas sus líneas de origen
 * distinto — ver comentario en el schema), una fila de OrdenCompra real
 * por cada asignación (mismo criterio que `generarOrdenDesdeComparacion`,
 * ahora capaz de cubrir varias necesidades/Proveedores de un solo click).
 */
export async function generarOrdenesDesdeAsignaciones(asignaciones: AsignacionInput[], generadoPorId: string) {
  await validarYAgruparAsignaciones(asignaciones); // re-valida (defensa en profundidad, no confía solo en la vista previa del cliente)

  const cotizacionIds = [...new Set(asignaciones.map((a) => a.cotizacionId))];
  const cotizaciones = await prisma.comparacionCotizacion.findMany({
    where: { id: { in: cotizacionIds } },
    include: { zona: true, comparacion: { include: { ordenCompra: true } } },
  });
  const cotizacionPorId = new Map(cotizaciones.map((c) => [c.id, c]));

  // Estado "cubierta" (fuera de la transacción, ANTES de escribir nada):
  // cuánto le falta a cada necesidad ahora mismo (previo a esta tanda), para
  // poder decidir cubierta/no según lo que se le vaya sumando dentro del
  // loop — no se puede volver a consultar `obtenerComparacionCalculada` DENTRO
  // de la transacción (usa el cliente Prisma normal, no `tx`, y no vería las
  // filas recién creadas todavía sin commit).
  const necesidadIds = [...new Set(cotizaciones.map((c) => c.comparacion.ordenCompra?.id).filter((x): x is string => !!x))];
  const pendientePrevio = new Map<string, number>();
  for (const necesidadId of necesidadIds) {
    const comparacion = cotizaciones.find((c) => c.comparacion.ordenCompra?.id === necesidadId)!.comparacion;
    const calc = await obtenerComparacionCalculada(comparacion.id);
    pendientePrevio.set(necesidadId, calc?.cantidadPendiente ?? 0);
  }

  const porProveedor = new Map<string, AsignacionInput[]>();
  for (const a of asignaciones) {
    const proveedorId = cotizacionPorId.get(a.cotizacionId)!.proveedorId;
    if (!porProveedor.has(proveedorId)) porProveedor.set(proveedorId, []);
    porProveedor.get(proveedorId)!.push(a);
  }

  return prisma.$transaction(async (tx) => {
    const ordenesCreadas = [];
    for (const [, lineasProveedor] of porProveedor) {
      const numero = await siguienteFolio(tx, "orden_compra");
      for (const a of lineasProveedor) {
        const cot = cotizacionPorId.get(a.cotizacionId)!;
        const necesidad = cot.comparacion.ordenCompra!;
        const calc = calcularCotizacion(a.cantidad, {
          moneda: cot.moneda,
          precioValor: Number(cot.precioValor),
          tipoCambio: cot.tipoCambio != null ? Number(cot.tipoCambio) : null,
          presentacionCantidad: Number(cot.presentacionCantidad),
          costoFleteKg: Number(cot.zona.costoFleteKg),
        });

        const ordenReal = await tx.ordenCompra.create({
          data: {
            origen: necesidad.origen,
            productoId: necesidad.productoId,
            cantidadSolicitada: a.cantidad,
            estado: "generada",
            proveedorId: cot.proveedorId,
            precioUnitario: calc.precioUnitarioMXN,
            referenciaAplicacionId: necesidad.referenciaAplicacionId,
            comparacionCotizacionId: cot.id,
            creadoPorId: generadoPorId,
            fechaFormalizacion: new Date(),
            numero,
          },
        });
        ordenesCreadas.push(ordenReal);

        const restante = (pendientePrevio.get(necesidad.id) ?? 0) - a.cantidad;
        pendientePrevio.set(necesidad.id, restante);
        if (restante <= 0.0001) {
          await tx.ordenCompra.update({ where: { id: necesidad.id }, data: { estado: "cubierta" } });
        }
      }
    }
    return ordenesCreadas;
  });
}
