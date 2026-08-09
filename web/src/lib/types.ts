export interface Huerta {
  id: string;
  nombre: string;
  hectareasTotales: string;
  activo: boolean;
  mapaUrl?: string | null;
}

export interface AreaEfectiva {
  areaEfectiva: number;
  porcentajeAprovechamiento: number;
}

export type EstatusCuadro = "activo" | "en_descanso" | "fuera_produccion";

export interface CuadroVersion {
  id: string;
  vigenteDesde: string;
  vigenteHasta: string | null;
  hectareas: string;
  tipoSuelo: string | null;
  fechaSiembra: string | null;
  distSurcosM: string | null;
  distPlantasM: string | null;
  variedad: string | null;
}

export interface Cuadro {
  id: string;
  huertaId: string;
  nombre: string;
  estatus: EstatusCuadro;
  camposPersonalizados: Record<string, unknown> | null;
  versiones: CuadroVersion[];
  plantasTotales: number | null;
}

export type TipoCiclo = "cultivo" | "descanso" | "prueba";
export type EtapaCiclo = "preparacion_suelo" | "desarrollo" | "cosecha_empaque" | "post_cosecha";

export interface CicloVariedad {
  id: string;
  cuadroId: string;
  variedad: string;
  hectareas: string | null;
  porcentaje: string | null;
}

export interface Ciclo {
  id: string;
  huertaId: string;
  tipo: TipoCiclo;
  etapaActual: EtapaCiclo;
  fechaInicio: string;
  fechaFin: string | null;
  activo: boolean;
  variedades: CicloVariedad[];
}

export interface SeccionRiego {
  id: string;
  huertaId: string;
  nombre: string;
  cuadros: { cuadro: Cuadro }[];
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

export interface Producto {
  id: string;
  categoria: string;
  ingredienteActivo: string | null;
  nombreComercial: string;
  presentacion: string;
  unidad: string;
  requiereLote: boolean;
  autorizado: boolean;
}

export interface ProductoLote {
  id: string;
  lote: string;
  fechaCaducidad: string | null;
  cantidadActual: string;
}

export type TipoMovimientoAlmacenCentral =
  | "entrada_compra"
  | "salida_comprometida"
  | "salida_real"
  | "prestamo_rancho"
  | "merma"
  | "baja_caducidad"
  | "abono_sobrante"
  | "ajuste_manual";

export interface MovimientoAlmacenCentral {
  id: string;
  productoId: string;
  loteId: string | null;
  tipo: TipoMovimientoAlmacenCentral;
  cantidad: string;
  huertaDestinoId: string | null;
  fecha: string;
  motivoAjuste: string | null;
}

export interface AlmacenLocalEntrada {
  id: string;
  huertaId: string;
  productoId: string;
  producto: Producto;
  cantidadRecibidaAcumulada: string;
  cantidadReportadaAcumulada: string;
}

export interface CandadoAlmacenLocal {
  huertaId: string;
  productoId: string;
  nombreComercial: string;
  cantidadRecibida: number;
  cantidadReportada: number;
  saldoSinJustificar: number;
  diasDesdeUltimaEntrega: number | null;
  alertaActiva: boolean;
}

export interface SolicitudPendiente {
  id: string;
  tipo: string;
  entidadTabla: string;
  entidadId: string | null;
  payload: Record<string, unknown>;
  estado: "pendiente" | "autorizada" | "rechazada";
  fechaPropuesta: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  creditoMonto: string | null;
  creditoVencimiento: string | null;
  activo: boolean;
}

export interface MejorProveedor {
  proveedor: Proveedor;
  precioUnitario: string;
  fecha: string;
}

export type EstadoOrdenCompra = "pendiente_autorizar" | "pendiente_cotizar" | "generada" | "recibida" | "rechazada";

export interface OrdenCompra {
  id: string;
  origen: "automatica" | "manual";
  productoId: string;
  producto: Producto;
  cantidadSolicitada: string;
  estado: EstadoOrdenCompra;
  proveedorId: string | null;
  proveedor: Proveedor | null;
  precioUnitario: string | null;
  fechaEsperada: string | null;
  motivoRechazo: string | null;
  fechaCreacion: string;
}
