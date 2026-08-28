// Formato de números (27-ago-2026, pedido explícito para todo el sistema):
// separador de miles siempre, en cualquier cantidad que pueda pasar de
// 999 — horas, hectáreas, existencia de Almacén, montos de Nómina/Compras.
// Un solo lugar para no repetir el mismo `toLocaleString` suelto en cada
// pantalla (antes duplicado como `formaEntero` en varios archivos).

/** Cantidad general (horas, hectáreas, existencia, etc.) — hasta `maxDecimales`, sin ceros de más. */
export function formatearNumero(valor: number | string, maxDecimales = 3): string {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return String(valor);
  return n.toLocaleString("es-MX", { maximumFractionDigits: maxDecimales });
}

/** Monto en pesos — siempre 2 decimales exactos, con separador de miles y símbolo "$". */
export function formatearDinero(valor: number | string): string {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return String(valor);
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
