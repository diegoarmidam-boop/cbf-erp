export type EsquemaPago = "individual_hora" | "individual_caja" | "grupal_remolque" | "depende_empacadores";

export interface ActividadCalc {
  tarifa: number;
  usarTarifaGeneral: boolean;
}

export class TarifaGeneralNoConfiguradaError extends Error {
  constructor() {
    super("La tarifa general por hora todavía no está configurada (Nómina > Catálogos).");
  }
}

export function tarifaEfectiva(actividad: ActividadCalc, tarifaGeneralHora: number | null): number {
  if (actividad.usarTarifaGeneral) {
    if (tarifaGeneralHora == null) throw new TarifaGeneralNoConfiguradaError();
    return tarifaGeneralHora;
  }
  return actividad.tarifa;
}

/** Monto de un registro individual (esquemas individual_hora, individual_caja) o de un registro grupal ANTES de dividir entre el grupo. */
export function totalRegistro(cantidad: number, actividad: ActividadCalc, tarifaGeneralHora: number | null): number {
  return tarifaEfectiva(actividad, tarifaGeneralHora) * cantidad;
}

/** Reparte el total de un registro grupal (esquema grupal_remolque) entre quienes estaban en el grupo ese día. */
export function totalRegistroGrupalPorPersona(totalGrupal: number, integrantesEseDia: number): number {
  if (integrantesEseDia <= 0) return 0;
  return totalGrupal / integrantesEseDia;
}

export interface CalculoDependeEmpacadoresInput {
  /** Suma de cantidades (cajas) de todos los registros de la actividad "Empacador" (individual_caja) ese día, en esa Huerta. */
  cajasTotalesEmpacador: number;
  /** tarifaEfectiva() de la actividad "depende_empacadores" en cuestión (ej. Pesador, Tapa Caja...). */
  tarifaActividad: number;
  /** Cuántas personas están dadas de alta en esa actividad "depende" ese día, en esa Huerta. */
  personasEnActividad: number;
}

/**
 * Esquema (4) del catálogo: bolsa total = cajas de Empacador × tarifa de la
 * actividad, dividida entre cuántas personas están dadas de alta en esa
 * actividad ese día (ej. Pesador, Tapa Caja, Lavador...).
 */
export function montoDependeEmpacadoresPorPersona(input: CalculoDependeEmpacadoresInput): number {
  if (input.personasEnActividad <= 0) return 0;
  const bolsaTotal = input.cajasTotalesEmpacador * input.tarifaActividad;
  return bolsaTotal / input.personasEnActividad;
}

/**
 * Candado del esquema "Depende de Empacadores": si alguien está dado de alta
 * en una de esas actividades pero no hay ningún registro de Empacador ese
 * día en esa Huerta, se bloquea el guardado de la nómina de ese día.
 */
export function candadoDependeEmpacadoresBloquea(personasEnActividad: number, cajasTotalesEmpacador: number): boolean {
  return personasEnActividad > 0 && cajasTotalesEmpacador === 0;
}
