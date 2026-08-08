// Cálculo de billetes y monedas mínimos para armar los sobres de efectivo
// (documento vivo, 9.11). Las denominaciones del peso mexicano forman un
// sistema canónico — el algoritmo "goloso" (tomar siempre la denominación
// más grande que quepa) garantiza el mínimo número de piezas.
export const DENOMINACIONES_MXN = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export interface DesglosePieza {
  denominacion: number;
  cantidad: number;
}

/** Redondea hacia arriba al peso más cercano (los centavos se absorben) y desglosa. */
export function desglosarMonto(montoNeto: number): DesglosePieza[] {
  let restante = Math.ceil(montoNeto);
  const piezas: DesglosePieza[] = [];
  for (const denominacion of DENOMINACIONES_MXN) {
    const cantidad = Math.floor(restante / denominacion);
    if (cantidad > 0) {
      piezas.push({ denominacion, cantidad });
      restante -= cantidad * denominacion;
    }
  }
  return piezas;
}

/** Total agregado por denominación de varios desgloses — para pedir el efectivo exacto en el banco. */
export function sumarDesgloses(desgloses: DesglosePieza[][]): DesglosePieza[] {
  const totales = new Map<number, number>();
  for (const desglose of desgloses) {
    for (const pieza of desglose) {
      totales.set(pieza.denominacion, (totales.get(pieza.denominacion) ?? 0) + pieza.cantidad);
    }
  }
  return DENOMINACIONES_MXN.filter((d) => totales.has(d)).map((denominacion) => ({
    denominacion,
    cantidad: totales.get(denominacion)!,
  }));
}
