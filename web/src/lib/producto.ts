import type { Producto } from "./types";

/**
 * Combina contenedor + cantidad + unidad solo para mostrarse (ej. "Saco 25
 * kg"). Desde la Prioridad 2 (4-sep-2026) la Presentación ya no es fija por
 * Producto — se captura por transacción (cotización, recepción, lote), así
 * que esto ya no recibe un Producto sino la Presentación específica de esa
 * transacción, más la unidad base del Producto para la etiqueta.
 */
export function presentacionTexto(p: { contenedor: string; presentacionCantidad: number | string; unidad: string }): string {
  return `${p.contenedor} ${p.presentacionCantidad} ${p.unidad}`;
}

/** "Nombre Comercial — Marca" (Prioridad 2, 3-sep-2026) — la Marca es un catálogo abierto aparte, puede no estar capturada. */
export function nombreConMarca(p: Pick<Producto, "nombreComercial" | "marca">): string {
  return p.marca ? `${p.nombreComercial} — ${p.marca}` : p.nombreComercial;
}
