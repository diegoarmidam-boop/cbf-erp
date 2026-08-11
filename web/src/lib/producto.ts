import type { Producto } from "./types";

/** Combina contenedor + cantidad + unidad solo para mostrarse (ej. "Saco 25 kg") — se capturan por separado. */
export function presentacionTexto(p: Pick<Producto, "contenedor" | "presentacionCantidad" | "unidad">): string {
  return `${p.contenedor} ${p.presentacionCantidad} ${p.unidad}`;
}
