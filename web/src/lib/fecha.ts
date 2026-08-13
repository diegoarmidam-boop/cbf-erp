/** Todas las fechas se guardan/transmiten como ISO (AAAA-MM-DD); esto es solo para mostrarlas (bloque 1, confirmado 9-ago-2026). */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const soloFecha = iso.slice(0, 10); // por si viene con hora (ej. "2026-08-09T00:00:00.000Z")
  const [anio, mes, dia] = soloFecha.split("-");
  if (!anio || !mes || !dia) return "—";
  return `${dia}/${mes}/${anio}`;
}

export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Para timestamps reales (ej. "se recibió la compra a las 20:50"), a
 * diferencia de `formatearFecha` — que asume que el ISO ya es sólo un día
 * de calendario (sin hora) y por eso puede leer los primeros 10
 * caracteres tal cual. Un timestamp completo sí lleva zona UTC, así que
 * hay que convertirlo a los componentes de fecha LOCALES o el día se lee
 * mal durante la tarde/noche en México (cuando UTC ya es el día siguiente).
 */
export function formatearInstante(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
