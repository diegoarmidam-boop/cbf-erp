import type { Producto } from "./types";

/** Combina contenedor + cantidad + unidad solo para mostrarse (ej. "Saco 25 kg") — se capturan por separado. */
export function presentacionTexto(p: Pick<Producto, "contenedor" | "presentacionCantidad" | "unidad">): string {
  return `${p.contenedor} ${p.presentacionCantidad} ${p.unidad}`;
}

/** "Nombre Comercial — Marca" (Prioridad 2, 3-sep-2026) — la Marca es un catálogo abierto aparte, puede no estar capturada. */
export function nombreConMarca(p: Pick<Producto, "nombreComercial" | "marca">): string {
  return p.marca ? `${p.nombreComercial} — ${p.marca}` : p.nombreComercial;
}
