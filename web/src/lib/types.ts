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
  noDisponibleDesde?: string | null;
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
export type TipoRecursoActividad = "gente" | "tractor" | "mixta";

export interface Actividad {
  id: string;
  nombre: string;
  unidad: string;
  tarifa: string;
  usarTarifaGeneral: boolean;
  esquemaPago: EsquemaPago;
  requiereCuadro: boolean;
  tipoRecurso: TipoRecursoActividad;
  activo: boolean;
}

export interface GrupoPago {
  id: string;
  nombre: string | null;
  persistente: boolean;
  miembrosHoy?: string[];
}

export type TipoAsistenciaGrupoDia = "ausente" | "sustituto";

export interface GrupoAsistenciaDia {
  id: string;
  grupoId: string;
  fecha: string;
  personalId: string;
  personal: Personal;
  tipo: TipoAsistenciaGrupoDia;
  registradoPorId: string;
}

export interface ChecklistDiaGrupo {
  roster: Personal[];
  marcas: GrupoAsistenciaDia[];
}

export interface FilaCaptura {
  tipo: "individual" | "grupal";
  personalId?: string;
  grupoId?: string;
  actividadId: string;
  cuadroId?: string;
  cantidad: number | null;
}

export type OrigenRegistroNomina =
  | "manual"
  | "automatico_aplicacion"
  | "automatico_fertilizacion"
  | "automatico_actividad"
  | "automatico_cosecha"
  | "automatico_empaque";

export interface RegistroNomina extends FilaCaptura {
  id: string;
  huertaId: string;
  actividad: Actividad;
  personal?: Personal | null;
  cuadro?: Cuadro | null;
  origen: OrigenRegistroNomina;
}

export interface CapturaDelDiaResponse {
  registros: RegistroNomina[];
  cerrado: boolean;
  sugerencia: FilaCaptura[];
}

export interface CapturaHuertaTodasUPs {
  huerta: Huerta;
  registros: RegistroNomina[];
  cerrado: boolean;
  sugerencia: FilaCaptura[];
}

export type EstadoPlazo = "al_corriente" | "vence_hoy" | "vencido";

export interface DiaPendiente {
  fecha: string;
  estado: EstadoPlazo;
}

export interface ResumenCierreHuerta {
  huerta: { id: string; nombre: string };
  cantidadPersonas: number;
  totalActividades: number;
  totalBruto: number;
  cerrado: boolean;
  estadoPlazo: EstadoPlazo;
}

export interface DiaCerradoInfo {
  fecha: string;
  cerradoPorNombre: string;
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

// ---- Liquidaciones (9.11, 15-ago-2026) — pago fuera de ciclo para
// personal eventual/destajo que deja de venir a mitad del periodo. ----
export interface PrestamoPendienteLiquidacion {
  prestamoId: string;
  motivo: string;
  saldoPendiente: number;
  montoSugerido: number;
}

export interface LiquidacionCalculada {
  personalId: string;
  nombreCompleto: string;
  bruto: number;
  bonos: number;
  neto: number;
  prestamosPendientes: PrestamoPendienteLiquidacion[];
}

export interface Liquidacion {
  id: string;
  personalId: string;
  personal: { nombreCompleto: string };
  fechaInicio: string;
  fechaFin: string;
  bruto: string;
  bonos: string;
  descuentoPrestamos: string;
  neto: string;
  liquidadoPorId: string;
  fechaLiquidacion: string;
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
  contenedor: string;
  presentacionCantidad: string;
  unidad: string;
  requiereLote: boolean;
  autorizado: boolean;
  activo: boolean;
}

export interface CatalogoAbiertoItem {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface IngredienteActivoSustituto {
  id: string;
  productoId: string;
  producto: Producto;
  orden: number;
}

export interface PreferenciaIngredienteActivo {
  ingredienteActivoId: string;
  ingredienteActivoNombre: string;
  productoPreferido: Producto | null;
  sustitutos: IngredienteActivoSustituto[];
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
  | "ajuste_manual"
  | "consumo_maquinaria";

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

export interface CancelacionPendienteBodega {
  id: string;
  tipo: "cancelacion" | "ajuste_dosis";
  origen?: "aplicacion" | "granular";
  huerta: { nombre: string };
  producto: { nombreComercial: string; unidad: string };
  cantidadRegresada: number;
  fecha: string | null;
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

export interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  detalle: string;
  urgente: boolean;
  fecha: string;
  enlace: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  creditoMonto: string | null;
  creditoVencimiento: string | null;
  diasCredito: number | null;
  activo: boolean;
}

export interface MejorProveedor {
  proveedor: Proveedor;
  precioUnitario: string;
  fecha: string;
}

export type EstadoOrdenCompra = "pendiente_autorizar" | "pendiente_cotizar" | "generada" | "recibida" | "rechazada";

export interface OrdenCompraRecepcion {
  id: string;
  cantidadRecibida: string;
  lote: string | null;
  fechaCaducidad: string | null;
  fechaRecepcion: string;
}

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
  fechaFormalizacion: string | null;
  pagada: boolean;
  fechaPago: string | null;
  recepciones: OrdenCompraRecepcion[];
}

export interface OrdenCxP {
  id: string;
  producto: { nombreComercial: string };
  proveedor: { id: string; nombre: string; diasCredito: number };
  precioUnitario: string | null;
  cantidadSolicitada: string;
  fechaFormalizacion: string;
  fechaLimitePago: string;
  viernesDePago: string;
  alertaVisible: boolean;
}

export interface ComparacionResumen {
  id: string;
  nombre: string | null;
  fechaCreacion: string;
  items: { producto: { nombreComercial: string } }[];
}

export interface CotizacionCalculada {
  id: string;
  proveedor: { id: string; nombre: string };
  precioPresentacion: number;
  cantidadPresentacion: number;
  unidadPresentacion: string;
  unidadesAPedir: number;
  cantidadComprada: number;
  precioFinal: number;
  porcentajeAprovechamiento: number;
  recomendado: boolean;
}

export interface ItemCalculado {
  id: string;
  producto: { id: string; nombreComercial: string };
  cantidadNecesaria: number;
  unidad: string;
  cotizaciones: CotizacionCalculada[];
  recomendacion: { proveedorId: string; proveedorNombre: string; ahorro: number } | null;
}

export interface ComparacionCalculada {
  id: string;
  nombre: string | null;
  fechaCreacion: string;
  items: ItemCalculado[];
}

export type TipoEquipo = "tractor" | "camioneta" | "remolque" | "implemento";

export interface Equipo {
  id: string;
  tipo: TipoEquipo;
  folio: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  placas: string | null;
  operadorDesignadoId: string | null;
  activo: boolean;
}

export type TipoCombustible = "diesel_garrafa" | "gasolina_externa" | "diesel_externo";

export interface CombustibleCarga {
  id: string;
  equipoId: string;
  fecha: string;
  tipo: TipoCombustible;
  odometro: string | null;
  horometro: string | null;
  litros: string;
  precioUnitario: string | null;
}

export interface AlertaRendimiento {
  tasaActual: number;
  promedioHistorico: number;
  unidad: "L/hora" | "km/L";
  desviacionPorcentual: number;
  anomalo: boolean;
}

export interface MantenimientoConcepto {
  id: string;
  equipoId: string;
  nombre: string;
  umbralHoras: string;
}

export interface MantenimientoEvento {
  id: string;
  tipo: "preventivo" | "correctivo";
  conceptoId: string | null;
  concepto: MantenimientoConcepto | null;
  descripcion: string;
  mecanicoInterno: boolean;
  costo: string | null;
  fecha: string;
}

export interface AlertaMantenimiento {
  conceptoId: string;
  nombre: string;
  umbralHoras: number;
  horasAcumuladasDesdeUltimoServicio: number;
  vencido: boolean;
}

export interface EquipoUsoDiario {
  id: string;
  fecha: string;
  operador: { nombreCompleto: string };
  horas: string;
  huerta: { nombre: string };
}

// ---- Actividades (9.4) — mismo patrón de dos pasos que Aplicaciones.
// Desde 15-ago-2026 sí maneja maquinaria (líneas de tractor/mixta/gente),
// con horas por persona (no compartidas por línea, a diferencia de
// Aplicaciones). ----
export interface ActividadRealizadaCuadro {
  id: string;
  cuadroId: string;
  cuadro: Cuadro;
  hectareas: string;
}

export interface ActividadRealizadaLineaPersona {
  personalId: string;
  personal: Personal;
  horas: string;
}

export interface ActividadRealizadaLinea {
  id: string;
  tipo: TipoRecursoActividad;
  tractorId: string | null;
  tractor: Equipo | null;
  operadorId: string | null;
  operador: Personal | null;
  operadorHoras: string | null;
  implementoId: string | null;
  implemento: Equipo | null;
  personas: ActividadRealizadaLineaPersona[];
}

export interface ActividadRealizada {
  id: string;
  actividadProgramadaId: string;
  fechaReal: string;
  registradoPorId: string;
  cuadros: ActividadRealizadaCuadro[];
  lineas: ActividadRealizadaLinea[];
}

export interface ActividadProgramada {
  id: string;
  huertaId: string;
  huerta: Huerta;
  actividadId: string;
  actividad: Actividad;
  fechaInicio: string;
  fechaFin: string;
  hectareasTotalesProgramadas: string;
  creadoPorId: string;
  fechaCreacion: string;
  cuadros: { cuadro: Cuadro }[];
  realizadas: ActividadRealizada[];
  hectareasAvanzadas?: number;
  horasHombreTotales?: number;
  porcentajeAvance?: number;
  costoTotal?: number;
  restantesPorCuadro?: Record<string, number>;
}

export type RecursoTipo = "gente" | "implemento";
export type ConcentracionUnidad = "ml_l" | "g_l" | "kg_l";
export type EstadoAplicacion = "programada" | "entregada" | "realizada" | "vencida" | "cancelada";

// Modalidad real de ejecución de una Aplicación (9.7, 8-ago-2026) — exclusivo
// de Aplicaciones, Fertilización Granular conserva RecursoTipo sin cambios.
export type ModalidadAplicacion = "mochila" | "turbina" | "aguilon";

export interface RealizadaCuadro {
  id: string;
  cuadroId: string;
  cuadro: Cuadro;
  hectareas: string;
}

export interface LineaRealizadaPersona {
  personalId: string;
  personal: Personal;
}

export interface AplicacionRealizadaLinea {
  id: string;
  realizadaId: string;
  modalidad: ModalidadAplicacion;
  tractorId: string | null;
  tractor: Equipo | null;
  operadorId: string | null;
  operador: Personal | null;
  implementoId: string | null;
  implemento: Equipo | null;
  horas: string;
  personas: LineaRealizadaPersona[];
}

export interface AplicacionRealizada {
  id: string;
  aplicacionId: string;
  fechaReal: string;
  registradoPorId: string;
  cuadros: RealizadaCuadro[];
  lineas: AplicacionRealizadaLinea[];
}

export interface AplicacionProducto {
  id: string;
  productoId: string;
  producto: Producto;
  concentracionValor: string;
  concentracionUnidad: ConcentracionUnidad;
  cantidadTotalCalculada: string;
}

// Recetario (20-ago-2026)
export interface TipoAplicacion {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface RecetaProducto {
  id: string;
  productoId: string;
  producto: Producto;
  concentracionValor: string;
  concentracionUnidad: ConcentracionUnidad;
}

export type ModuloReceta = "aplicaciones" | "fertirriego";

export interface Receta {
  id: string;
  nombre: string;
  modulo: ModuloReceta;
  tipoAplicacionId: string | null;
  tipoAplicacion: TipoAplicacion | null;
  litrosPorHa: string;
  activo: boolean;
  productos: RecetaProducto[];
}

// Mezcla por tanque (20-ago-2026) — un elemento por producto de la programación.
export interface TanqueParcial {
  fraccion: number;
  volumenMezcla: number;
  cantidadProducto: number;
}

export interface MezclaTanqueProducto {
  productoId: string;
  hectareasPorTanque: number;
  numeroTanques: number;
  tanquesCompletos: number;
  cantidadProductoPorTanqueCompleto: number;
  tanqueParcial: TanqueParcial | null;
}

export interface Aplicacion {
  id: string;
  huertaId: string;
  huerta: Huerta;
  productos: AplicacionProducto[];
  recursoSugerido: ModalidadAplicacion;
  litrosMezclaPorHa: string;
  recetaId: string | null;
  capacidadTanque: string | null;
  fechaInicio: string;
  fechaFin: string;
  hectareasTotalesProgramadas: string;
  estado: EstadoAplicacion;
  fechaCreacion: string;
  canceladaPorId: string | null;
  fechaCancelacion: string | null;
  confirmacionBodegaPorId: string | null;
  fechaConfirmacionBodega: string | null;
  cuadros: { cuadro: Cuadro }[];
  realizadas: AplicacionRealizada[];
  comprometido?: boolean;
  diasSinEntregar?: number | null;
  alertaVencimiento?: boolean;
  diasSinAplicar?: number | null;
  alertaPendienteAplicar?: boolean;
  hectareasAvanzadas?: number;
  horasHombreTotales?: number;
  porcentajeAvance?: number;
  restantesPorCuadro?: Record<string, number>;
  mezclaPorTanque?: MezclaTanqueProducto[] | null;
}

export type ModoDosisGranular = "kg_ha" | "g_planta";

export interface FertilizacionGranularRealizada {
  id: string;
  fertilizacionId: string;
  personalId: string | null;
  grupoId: string | null;
  horas: string;
  fechaReal: string;
  registradoPorId: string;
  cuadros: RealizadaCuadro[];
}

export interface FertilizacionGranularProducto {
  id: string;
  productoId: string;
  producto: Producto;
  modoDosis: ModoDosisGranular;
  dosisValor: string;
  cantidadTotalCalculada: string;
}

export interface FertilizacionGranular {
  id: string;
  huertaId: string;
  huerta: Huerta;
  productos: FertilizacionGranularProducto[];
  recursoTipo: RecursoTipo;
  equipoId: string | null;
  equipo: Equipo | null;
  fechaInicio: string;
  fechaFin: string;
  hectareasTotalesProgramadas: string;
  estado: EstadoAplicacion;
  fechaCreacion: string;
  canceladaPorId: string | null;
  fechaCancelacion: string | null;
  confirmacionBodegaPorId: string | null;
  fechaConfirmacionBodega: string | null;
  cuadros: { cuadro: Cuadro }[];
  realizadas: FertilizacionGranularRealizada[];
  comprometido?: boolean;
  diasSinEntregar?: number | null;
  alertaVencimiento?: boolean;
  diasSinAplicar?: number | null;
  alertaPendienteAplicar?: boolean;
  hectareasAvanzadas?: number;
  horasHombreTotales?: number;
  porcentajeAvance?: number;
}

export type FrecuenciaFertirriego = "diario" | "cada_2_dias" | "cada_3_dias" | "patron_2_1";

export interface RiegoRegistroDiarioProducto {
  id: string;
  productoId: string;
  cantidadAplicada: string;
}

export interface RiegoRegistroDiario {
  id: string;
  seccionId: string;
  fecha: string;
  horas: string;
  fertirriegoConfirmado: boolean;
  productos: RiegoRegistroDiarioProducto[];
  motivoNoAplicado: string | null;
  capturadoPorId: string;
}

export interface FertirriegoActivo {
  fertirriegoId: string;
  productos: Producto[];
}

export interface RiegoDiaResponse {
  registro: RiegoRegistroDiario | null;
  fertirriegoActivo: FertirriegoActivo | null;
}

export interface RiegoSeccionFila {
  seccion: SeccionRiego;
  registro: RiegoRegistroDiario | null;
  fertirriegoActivo: FertirriegoActivo | null;
}

export interface RiegoHuertaTodasUPs {
  huerta: Huerta;
  secciones: RiegoSeccionFila[];
}

export interface RiegoHistorialSemanalDia {
  fecha: string;
  horas: number | null;
  fertirriegoAplicado: boolean;
}

export interface RiegoHistorialSemanal {
  dias: { fecha: string; etiqueta: string }[];
  secciones: { seccion: SeccionRiego; dias: RiegoHistorialSemanalDia[] }[];
}

export interface FertirriegoProgramacionProducto {
  id: string;
  productoId: string;
  producto: Producto;
  dosisValor: string;
  dosisUnidad: ConcentracionUnidad;
  cantidadTotalCalculada: string;
}

export interface FertirriegoProgramacion {
  id: string;
  huertaId: string;
  huerta: Huerta;
  productos: FertirriegoProgramacionProducto[];
  litrosAguaPorHa: string;
  recetaId: string | null;
  capacidadTanque: string | null;
  frecuencia: FrecuenciaFertirriego;
  fechaInicio: string;
  fechaFin: string;
  estado: EstadoAplicacion;
  fechaCreacion: string;
  secciones: { seccion: SeccionRiego }[];
  comprometido?: boolean;
  diasSinEntregar?: number | null;
  alertaVencimiento?: boolean;
  mezclaPorTanque?: MezclaTanqueProducto[] | null;
}
