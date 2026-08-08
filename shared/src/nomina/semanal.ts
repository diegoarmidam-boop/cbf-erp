export interface FilaNominaSemanalInput {
  tipo: "fijo" | "destajo";
  sueldo: number | null;
  /** Si es tipo=fijo, si le toca cobrar sueldo en este periodo según su periodicidad (ver fechas.ts). */
  debePagarseSueldoEstePeriodo: boolean;
  /** Ganancia por destajo del periodo — aplica a CUALQUIER tipo, fijo o destajo. */
  gananciaDestajoPeriodo: number;
  bonos: number;
  descuentoPrestamos: number;
}

export interface FilaNominaSemanalResultado {
  bruto: number;
  neto: number;
}

/**
 * Fix del bug confirmado en el mockup (filasNominaSemanal): ahí, a una
 * persona fija se le asignaba `bruto = sueldo` ignorando el destajo que
 * hubiera hecho esa misma semana. Aquí el bruto de una persona fija es
 * sueldo (cuando le toca) MÁS cualquier destajo adicional — no son
 * esquemas mutuamente excluyentes.
 */
export function calcularFilaNominaSemanal(input: FilaNominaSemanalInput): FilaNominaSemanalResultado {
  const sueldoDelPeriodo = input.tipo === "fijo" && input.debePagarseSueldoEstePeriodo ? (input.sueldo ?? 0) : 0;
  const bruto = sueldoDelPeriodo + input.gananciaDestajoPeriodo;
  const neto = bruto + input.bonos - input.descuentoPrestamos;
  return { bruto, neto };
}
