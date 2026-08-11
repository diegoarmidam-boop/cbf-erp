/** Todas las fechas se guardan/transmiten como ISO (AAAA-MM-DD); esto es solo para mostrarlas (bloque 1, confirmado 9-ago-2026). */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const soloFecha = iso.slice(0, 10); // por si viene con hora (ej. "2026-08-09T00:00:00.000Z")
  const [anio, mes, dia] = soloFecha.split("-");
  if (!anio || !mes || !dia) return "—";
  return `${dia}/${mes}/${anio}`;
}

export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}
