export interface Huerta {
  id: string;
  nombre: string;
  hectareasTotales: string;
  activo: boolean;
}

export interface Personal {
  id: string;
  nombreCompleto: string;
  tipo: "fijo" | "destajo";
  huertaId: string | null;
  sueldo: string | null;
  puestoId: string | null;
  puesto?: Puesto | null;
  activo?: boolean;
  fechaNacimiento?: string | null;
  identificacion?: string | null;
  domicilio?: string | null;
  telefono?: string | null;
  telefonoEmergencia?: string | null;
  fechaIngreso?: string | null;
  rfc?: string | null;
  imssOSeguro?: string | null;
  fechaBaja?: string | null;
  motivoBaja?: string | null;
  documentos?: PersonalDocumento[];
}

export interface PersonalDocumento {
  id: string;
  personalId: string;
  tipoDocumento: "identificacion" | "contrato" | "comprobante_domicilio" | "otro";
  origen: "foto_celular" | "escaneo";
  archivoUrl: string;
  fechaSubida: string;
}

export interface Puesto {
  id: string;
  nombre: string;
  periodicidad: "semanal" | "quincenal" | "mensual";
  rangoSalarialMin: string | null;
  rangoSalarialMax: string | null;
  metodoAsignacionCosto: "directo_huerta" | "prorrateo_hectareas";
}

export interface DoNotHireEntry {
  id: string;
  nombreReferencia: string;
  motivo: string;
  condicionesSalida: string | null;
  fecha: string;
}

export interface UsuarioAcceso {
  id: string;
  nombre: string;
  username: string;
  rol: string;
  huertaId: string | null;
  activo: boolean;
  personalId: string | null;
}

export type EsquemaPago = "individual_hora" | "individual_caja" | "grupal_remolque" | "depende_empacadores";

export interface Actividad {
  id: string;
  nombre: string;
  unidad: string;
  tarifa: string;
  usarTarifaGeneral: boolean;
  esquemaPago: EsquemaPago;
  requiereCuadro: boolean;
  activo: boolean;
}

export interface GrupoPago {
  id: string;
  huertaId: string;
  nombre: string | null;
  persistente: boolean;
  miembrosHoy?: string[];
}

export interface FilaCaptura {
  tipo: "individual" | "grupal";
  personalId?: string;
  grupoId?: string;
  actividadId: string;
  cuadroId?: string;
  cantidad: number | null;
}

export interface RegistroNomina extends FilaCaptura {
  id: string;
  actividad: Actividad;
}

export interface CapturaDelDiaResponse {
  registros: RegistroNomina[];
  cerrado: boolean;
  sugerencia: FilaCaptura[];
}

export type EstadoPlazo = "al_corriente" | "vence_hoy" | "vencido";

export interface DiaPendiente {
  fecha: string;
  estado: EstadoPlazo;
}

export interface Prestamo {
  id: string;
  personalId: string;
  personal?: { nombreCompleto: string };
  montoTotal: string;
  motivo: string;
  periodicidad: "semanal" | "quincenal";
  montoPorDescuento: string;
  fechaPrimerDescuento: string;
  proximoDescuento: string;
  saldoPendiente: string;
  activo: boolean;
}

export interface PrestamoDescuento {
  id: string;
  periodoFin: string;
  monto: string;
  fechaAplicado: string;
}

export type TipoBono = "asistencia_perfecta" | "permanencia_racha" | "dia_doble";

export interface BonoConfig {
  id: string;
  nombre: string;
  tipo: TipoBono;
  parametros: Record<string, unknown>;
  activo: boolean;
  diasEspeciales: { id: string; fecha: string }[];
}

export interface BonoOtorgado {
  id: string;
  bonoConfigId: string;
  personalId: string;
  personal?: { nombreCompleto: string };
  bonoConfig?: { nombre: string; tipo: TipoBono };
  periodoInicio: string;
  periodoFin: string;
  montoCalculado: string;
  estado: "pendiente_autorizar" | "autorizado" | "rechazado";
}

export interface FilaReporteSemanal {
  personalId: string;
  nombreCompleto: string;
  tipo: "fijo" | "destajo";
  bruto: number;
  bonos: number;
  descuentoPrestamos: number;
  neto: number;
  prestamosAplicados: { prestamoId: string; monto: number }[];
}

export interface ReporteNominaSemanal {
  periodo: { inicio: string; fin: string };
  filas: FilaReporteSemanal[];
}

export interface ConfigNomina {
  diaCorteSemanal: string;
  diaCorteIndex: number;
  diasGraciaCierre: number;
  tarifaGeneralHora: number | null;
}

export type EstadoAsistenciaDia = "cumplio" | "falta_injustificada" | "sin_registro";
export interface DiaAsistencia {
  fecha: string;
  estado: EstadoAsistenciaDia;
}
