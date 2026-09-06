import { prisma } from "../../core/db.js";

/**
 * Vista de Inventario agrupada por Ingrediente Activo (Prioridad 2,
 * 4-sep-2026) — la Presentación dejó de ser fija por Producto Comercial,
 * así que el total ya no puede verse "por Producto" sin más: dos Marcas
 * distintas del mismo Ingrediente Activo (y, dentro de cada una, distintas
 * Presentaciones) tienen que sumarse en una sola cifra en la tarjeta
 * principal (decisión de Diego, 4-sep-2026, mismo criterio "Ingrediente
 * Activo, nunca marca" ya usado en Programar/Recetario). Los productos sin
 * Ingrediente Activo (empaque, refacciones, etc.) siguen viéndose uno por
 * uno, como antes — no hay "ingrediente" bajo el cual agruparlos.
 */
export interface GrupoInventario {
  // clave = nombre de Ingrediente Activo, o el propio productoId cuando el
  // producto no tiene Ingrediente Activo (grupo de un solo elemento).
  clave: string;
  esIngredienteActivo: boolean;
  nombre: string;
  categoria: string;
  unidad: string;
  totalStock: number;
}

export async function listarInventarioAgrupado(): Promise<GrupoInventario[]> {
  const productos = await prisma.producto.findMany({ where: { activo: true } });
  const lotes = await prisma.productoLote.findMany({ where: { productoId: { in: productos.map((p) => p.id) } } });

  const stockPorProducto = new Map<string, number>();
  for (const l of lotes) {
    stockPorProducto.set(l.productoId, (stockPorProducto.get(l.productoId) ?? 0) + Number(l.cantidadActual));
  }

  const grupos = new Map<string, GrupoInventario>();
  for (const p of productos) {
    const stock = stockPorProducto.get(p.id) ?? 0;
    const clave = p.ingredienteActivo ?? p.id;
    const existente = grupos.get(clave);
    if (existente) {
      existente.totalStock += stock;
    } else {
      grupos.set(clave, {
        clave,
        esIngredienteActivo: !!p.ingredienteActivo,
        nombre: p.ingredienteActivo ?? p.nombreComercial,
        categoria: p.categoria,
        unidad: p.unidad,
        totalStock: stock,
      });
    }
  }
  return [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export interface DetalleInventarioLinea {
  productoId: string;
  nombreComercial: string;
  marca: string | null;
  contenedor: string | null;
  presentacionCantidad: number | null;
  // Cuántos contenedores físicos representa el stock actual — puede ser
  // fraccionario (ej. 2.4 bultos) porque el consumo real no siempre agota
  // un contenedor completo. Null cuando el lote no tiene Presentación
  // registrada (ajustes/abonos que no vienen de una recepción real).
  unidadesFisicas: number | null;
  cantidadTotal: number;
}

/** Desglose por Nombre Comercial + Marca + Presentación (2.4) de un Ingrediente Activo. */
export async function detalleInventarioIngrediente(ingredienteActivo: string): Promise<{ unidad: string; totalStock: number; lineas: DetalleInventarioLinea[] }> {
  const productos = await prisma.producto.findMany({ where: { ingredienteActivo } });
  return armarDetalle(productos);
}

/** Desglose por Presentación de un solo Producto (productos sin Ingrediente Activo). */
export async function detalleInventarioProducto(productoId: string): Promise<{ unidad: string; totalStock: number; lineas: DetalleInventarioLinea[] }> {
  const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
  return armarDetalle([producto]);
}

async function armarDetalle(productos: { id: string; nombreComercial: string; marca: string | null; unidad: string }[]) {
  const lotes = await prisma.productoLote.findMany({ where: { productoId: { in: productos.map((p) => p.id) } } });
  const productoPorId = new Map(productos.map((p) => [p.id, p]));

  const porCombo = new Map<string, DetalleInventarioLinea>();
  for (const lote of lotes) {
    const producto = productoPorId.get(lote.productoId)!;
    const clave = `${lote.productoId}|${lote.contenedor ?? ""}|${lote.presentacionCantidad ?? ""}`;
    const cantidad = Number(lote.cantidadActual);
    const existente = porCombo.get(clave);
    if (existente) {
      existente.cantidadTotal += cantidad;
    } else {
      porCombo.set(clave, {
        productoId: lote.productoId,
        nombreComercial: producto.nombreComercial,
        marca: producto.marca,
        contenedor: lote.contenedor,
        presentacionCantidad: lote.presentacionCantidad != null ? Number(lote.presentacionCantidad) : null,
        unidadesFisicas: null,
        cantidadTotal: cantidad,
      });
    }
  }

  const lineas = [...porCombo.values()].map((l) => ({
    ...l,
    unidadesFisicas: l.presentacionCantidad ? l.cantidadTotal / l.presentacionCantidad : null,
  }));
  lineas.sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial, "es"));

  return {
    unidad: productos[0]?.unidad ?? "",
    totalStock: lineas.reduce((s, l) => s + l.cantidadTotal, 0),
    lineas,
  };
}
