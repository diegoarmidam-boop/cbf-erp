// Comparador de Cotizaciones (9.14, rediseño 29-ago-2026, a partir del
// Excel real "Cotizador CBF"): precio + flete por Zona, para decidir si
// conviene comprar foráneo o local. Herramienta de apoyo — no genera
// órdenes de compra.

export type MonedaCotizacion = "MXN" | "USD";

export interface CotizacionCalculoInput {
  moneda: MonedaCotizacion;
  precioValor: number; // en la moneda capturada
  tipoCambio: number | null; // solo si moneda === "USD"
  presentacionCantidad: number; // misma unidad que el producto
  costoFleteKg: number; // de la Zona de esta cotización
}

export interface CotizacionCalculada {
  precioValorMXN: number; // precio de UNA presentación, ya convertido a MXN
  precioUnitarioMXN: number; // por kg/L
  unidadesAPedir: number; // redondeado hacia arriba a presentaciones completas
  cantidadComprada: number;
  excedente: number; // cantidadComprada - cantidadNecesaria
  porcentajeExcedente: number;
  fleteTotal: number;
  precioTotalPresentaciones: number; // sin flete
  totalConFlete: number;
}

/**
 * Precio de una presentación convertido a MXN — si la moneda es USD, se
 * multiplica por el tipo de cambio capturado para ESA cotización (cada
 * proveedor puede manejar uno distinto ese día, no es un valor compartido
 * del sistema).
 */
export function precioEnMXN(moneda: MonedaCotizacion, precioValor: number, tipoCambio: number | null): number {
  return moneda === "USD" ? precioValor * (tipoCambio ?? 0) : precioValor;
}

/**
 * Cálculo completo de una línea de cotización (9.14). Redondeo siempre
 * hacia arriba a presentaciones completas (no se puede comprar una
 * fracción de costal/bidón) — mismo criterio que el Comparador anterior.
 * `costoFleteKg` ya viene resuelto de la Zona de esta cotización — la
 * Zona del comprador (Campeche) siempre trae 0 por definición, así que el
 * flete da $0 sin necesitar un caso especial aquí.
 *
 * Regla de conversión EXCLUSIVA de este cálculo (confirmada por Diego): 1
 * litro se trata igual que 1 kg para sumar peso de líquidos y sólidos al
 * calcular flete — `cantidadComprada` ya está en la unidad propia del
 * producto (L o kg), se multiplica tal cual por costoFleteKg sin ninguna
 * conversión adicional. Esta equivalencia NO aplica en ningún otro lado
 * del sistema (inventario, dosis, etc. mantienen L y kg exactos y
 * separados) — ver comentario completo en el schema, ComparacionCotizacion.
 */
export function calcularCotizacion(cantidadNecesaria: number, input: CotizacionCalculoInput): CotizacionCalculada {
  const precioValorMXN = precioEnMXN(input.moneda, input.precioValor, input.tipoCambio);
  const precioUnitarioMXN = input.presentacionCantidad > 0 ? precioValorMXN / input.presentacionCantidad : 0;
  const unidadesAPedir = Math.ceil(cantidadNecesaria / input.presentacionCantidad);
  const cantidadComprada = unidadesAPedir * input.presentacionCantidad;
  const excedente = cantidadComprada - cantidadNecesaria;
  const porcentajeExcedente = cantidadComprada > 0 ? (excedente / cantidadComprada) * 100 : 0;
  const precioTotalPresentaciones = unidadesAPedir * precioValorMXN;
  const fleteTotal = cantidadComprada * input.costoFleteKg;
  const totalConFlete = precioTotalPresentaciones + fleteTotal;

  return {
    precioValorMXN,
    precioUnitarioMXN,
    unidadesAPedir,
    cantidadComprada,
    excedente,
    porcentajeExcedente,
    fleteTotal,
    precioTotalPresentaciones,
    totalConFlete,
  };
}

export interface AhorroForaneo {
  monto: number;
  porcentaje: number;
}

/**
 * Regla de recomendación (confirmada por Diego): el foráneo solo se
 * recomienda si su Total con flete es menor al Total Local — "tiene que
 * ser más barato pagar el flete que comprarlo local, sino no costea". Si
 * `totalConFleteGlobal` (la mejor opción de cualquier Zona) ya es de la
 * Zona del comprador, no hay nada que comparar — gana local por
 * definición. `null` si no hay ninguna cotización de la Zona del
 * comprador capturada todavía (no se puede comparar contra algo que no
 * existe).
 */
export function calcularAhorroForaneo(totalConFleteGlobal: number, totalConFleteLocal: number | null): AhorroForaneo | null {
  if (totalConFleteLocal == null) return null;
  if (totalConFleteGlobal >= totalConFleteLocal) return null;
  const monto = totalConFleteLocal - totalConFleteGlobal;
  return { monto, porcentaje: totalConFleteLocal > 0 ? (monto / totalConFleteLocal) * 100 : 0 };
}
