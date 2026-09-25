import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useHuertas } from "../../lib/useHuertas";
import { usePersonal } from "../../lib/usePersonal";
import { useRecetas } from "../../lib/useRecetas";
import { useCatalogoAbierto } from "../../lib/useCatalogoAbierto";
import type { Aplicacion, AplicacionRealizadaLinea, ConcentracionUnidad, Cuadro, Equipo, IngredienteAutorizado, ModalidadAplicacion, OrdenAplicacion, TanquePendienteProducto } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha, formatearInstante } from "../../lib/fecha";
import { formatearNumero } from "../../lib/numero";
import RecetarioPanel, { ROLES_PUEDEN_RECETAS } from "../../components/RecetarioPanel";
import MezclaPorTanque from "../../components/MezclaPorTanque";
import HistorialAplicaciones from "./HistorialAplicaciones";
import OrdenAplicacionView from "../../components/OrdenAplicacionView";
import ConfirmModal from "../../components/ConfirmModal";

// Confirmar entrega con selección de lote (V1 P1, 25-sep-2026, regla e).
interface OpcionLoteEntrega {
  productoId: string;
  loteSugerido: { loteId: string; numeroLote: number | null; cantidad: number }[];
  otrosLotesConExistencia: { loteId: string; numeroLote: number | null; cantidadActual: number }[];
}

const ETIQUETAS_ESTADO: Record<string, string> = {
  programada: "Programada",
  entregada: "Entregada — pendiente de realizar",
  realizada: "Realizada",
  vencida: "Vencida/liberada",
  cancelada: "Cancelada",
};

const ETIQUETAS_MODALIDAD: Record<ModalidadAplicacion, string> = {
  mochila: "Mochila",
  turbina: "Turbina",
  aguilon: "Aguilón",
};

function tagEstado(estado: string) {
  if (estado === "realizada") return "tag-success";
  if (estado === "vencida" || estado === "cancelada") return "tag-danger";
  if (estado === "entregada") return "tag-neutral";
  return "tag-warning";
}

function hoyISO(): string {
  const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let contadorKey = 0;
function nuevaKey(): string {
  contadorKey += 1;
  return `linea-${Date.now()}-${contadorKey}`;
}

// Ingrediente Activo, nunca marca (Prioridad 1, 3-sep-2026).
interface ProductoForm {
  ingredienteActivoNombre: string;
  concentracionValor: string;
  concentracionUnidad: ConcentracionUnidad;
}

function productoFormVacio(): ProductoForm {
  return { ingredienteActivoNombre: "", concentracionValor: "", concentracionUnidad: "ml_l" };
}

interface LineaForm {
  key: string;
  modalidad: ModalidadAplicacion;
  tractorId: string;
  operadorId: string;
  implementoId: string;
  horas: string;
  personalIds: string[];
}

function lineaVacia(): LineaForm {
  return { key: nuevaKey(), modalidad: "mochila", tractorId: "", operadorId: "", implementoId: "", horas: "", personalIds: [] };
}

function lineasDesdeExistentes(lineas: AplicacionRealizadaLinea[]): LineaForm[] {
  return lineas.map((l) => ({
    key: nuevaKey(),
    modalidad: l.modalidad,
    tractorId: l.tractorId ?? "",
    operadorId: l.operadorId ?? "",
    implementoId: l.implementoId ?? "",
    horas: l.horas,
    personalIds: l.personas.map((p) => p.personalId),
  }));
}

/** Validación de espejo del backend (9.7) — evita un viaje al servidor solo para descubrir un error de forma. */
function validarLineasForm(lineas: LineaForm[]): string | null {
  if (lineas.length === 0) return "Falta capturar al menos una línea de recurso (Mochila, Turbina o Aguilón).";
  for (const l of lineas) {
    if (l.modalidad === "mochila") {
      if (l.personalIds.length === 0) return "Una línea de Mochila necesita al menos una persona.";
    } else {
      if (!l.tractorId || !l.operadorId || !l.implementoId) {
        return `Una línea de ${ETIQUETAS_MODALIDAD[l.modalidad]} necesita Tractor, Operador e Implemento.`;
      }
      if (l.modalidad === "turbina" && l.personalIds.length > 0) return "Una línea de Turbina no lleva gente extra detrás.";
      if (l.modalidad === "aguilon" && l.personalIds.length === 0) return "Una línea de Aguilón necesita al menos una persona detrás del tractor.";
    }
    if (!l.horas || Number(l.horas) <= 0) return "Falta capturar las horas de una línea.";
  }
  return null;
}

// Formato práctico, mismo criterio que MezclaPorTanque.tsx (mL/g redondean
// a entero, L/kg admiten 2 decimales) — se duplica aquí en vez de importar
// @cbf/shared completo al bundle del navegador (mismo criterio ya usado).
function formatearCantidadTanque(unidadConcentracion: ConcentracionUnidad, cantidadBase: number): string {
  const esVolumen = unidadConcentracion === "ml_l";
  const unidadGrande = esVolumen ? "L" : "kg";
  const unidadChica = esVolumen ? "mL" : "g";
  if (cantidadBase < 1 && cantidadBase > 0) {
    return `${formatearNumero(Math.round(cantidadBase * 1000))} ${unidadChica}`;
  }
  return `${formatearNumero(cantidadBase, 2)} ${unidadGrande}`;
}

/**
 * Nota estimada de tanque pendiente (Prioridad 2, 3-sep-2026) — SOLO
 * informativa, no toca el descuento real de Almacén (por hectárea
 * reportada, "límite honesto" ya documentado). Mismo cálculo espejo en
 * Almacén Local, ver AlmacenLocalPage.tsx.
 */
function NotaTanquePendiente({
  nota,
  productos,
}: {
  nota: TanquePendienteProducto[];
  productos: { productoId: string; ingredienteActivo: string | null; nombreComercial: string; concentracionUnidad: ConcentracionUnidad }[];
}) {
  const { tanquesNecesarios, tanquesPreparados } = nota[0]!;
  const tanquesCompletosUsados = Math.floor(tanquesNecesarios + 1e-9);
  const pctUsadoUltimoTanque = tanquesPreparados > tanquesCompletosUsados ? Math.round((tanquesNecesarios - tanquesCompletosUsados) * 100) : 0;

  return (
    <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
      Estimado: {tanquesCompletosUsados} tanque{tanquesCompletosUsados === 1 ? "" : "s"} completo{tanquesCompletosUsados === 1 ? "" : "s"} ya usado
      {tanquesCompletosUsados === 1 ? "" : "s"}
      {tanquesPreparados > tanquesCompletosUsados && `, más el siguiente al ${pctUsadoUltimoTanque}%`} — sin aplicar todavía:{" "}
      {nota
        .map((n) => {
          const p = productos.find((x) => x.productoId === n.productoId);
          return `${formatearCantidadTanque(p?.concentracionUnidad ?? "ml_l", n.cantidadProductoPendiente)} de ${p?.ingredienteActivo ?? p?.nombreComercial ?? n.productoId}`;
        })
        .join(" + ")}
    </div>
  );
}

export default function Aplicaciones() {
  const { usuario } = useAuth();
  const { huertas } = useHuertas();
  const { personal } = usePersonal();
  const { recetas, cargando: cargandoRecetas, refetch: refetchRecetas } = useRecetas("aplicaciones");
  const puedeAjustarReceta = usuario ? ROLES_PUEDEN_RECETAS.includes(usuario.rol) : false;

  const [aplicaciones, setAplicaciones] = useState<Aplicacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarRecetario, setMostrarRecetario] = useState(false);

  // Pre-llenado de contexto desde una notificación (29-ago-2026): ?id=
  // resalta y hace scroll a la Aplicación correspondiente (vencida o
  // pendiente de terminar).
  const [searchParams] = useSearchParams();
  const idResaltado = searchParams.get("id");
  const refResaltada = useRef<HTMLDivElement>(null);

  // ---- Programar ----
  const [mostrarForm, setMostrarForm] = useState(false);
  const [ingredientes, setIngredientes] = useState<IngredienteAutorizado[]>([]);
  const [huertaId, setHuertaId] = useState("");
  const [cuadrosHuerta, setCuadrosHuerta] = useState<Cuadro[]>([]);
  const [cuadroIds, setCuadroIds] = useState<string[]>([]);
  // Varios productos en el mismo tanque (10-ago-2026): cada uno con su
  // propia concentración, todos comparten litrosMezclaPorHa (abajo).
  const [productosForm, setProductosForm] = useState<ProductoForm[]>([productoFormVacio()]);
  const [recursoSugerido, setRecursoSugerido] = useState<ModalidadAplicacion>("mochila");
  const [litrosMezclaPorHa, setLitrosMezclaPorHa] = useState("");
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState(hoyISO());
  // Editar Paso 1 (15-ago-2026): solo mientras no haya reportes de avance —
  // reutiliza el mismo formulario de arriba, sin poder cambiar de Huerta.
  const [editandoProgramadaId, setEditandoProgramadaId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<{ tipo: "liberar" | "cancelar"; id: string } | null>(null);
  const [notaCancelacion, setNotaCancelacion] = useState("");

  // ---- Confirmar entrega con selección de lote (V1 P1, 25-sep-2026, regla e) ----
  const [entregandoId, setEntregandoId] = useState<string | null>(null);
  const [opcionesEntrega, setOpcionesEntrega] = useState<OpcionLoteEntrega[]>([]);
  const [overridesEntrega, setOverridesEntrega] = useState<Record<string, { loteIdElegido: string; motivo: string }>>({});
  const [entregandoError, setEntregandoError] = useState<string | null>(null);
  const [entregandoProcesando, setEntregandoProcesando] = useState(false);

  // ---- Recetario (20-ago-2026) ----
  const [recetaId, setRecetaId] = useState("");
  const [capacidadTanque, setCapacidadTanque] = useState("");
  // Si el rol autorizado ajustó una dosis respecto a la receta elegida, se
  // pregunta antes de guardar — no en cada tecla, para no interrumpir.
  const [confirmandoDesvioReceta, setConfirmandoDesvioReceta] = useState(false);

  // ---- Tipo de aplicación (25-ago-2026, Orden de Aplicación) ----
  const { items: tiposAplicacion, agregar: agregarTipoAplicacion } = useCatalogoAbierto("/tipos-aplicacion");
  const [tipoAplicacionId, setTipoAplicacionId] = useState("");
  const [nuevoTipoAplicacion, setNuevoTipoAplicacion] = useState("");
  const [mostrarNuevoTipoAplicacion, setMostrarNuevoTipoAplicacion] = useState(false);

  // ---- Orden de Aplicación (25-ago-2026) ----
  const [verOrdenId, setVerOrdenId] = useState<string | null>(null);
  const [ordenData, setOrdenData] = useState<OrdenAplicacion | null>(null);

  // ---- Equipos para líneas de Turbina/Aguilón ----
  const [tractores, setTractores] = useState<Equipo[]>([]);
  const [implementos, setImplementos] = useState<Equipo[]>([]);

  // ---- Registrar realizada ----
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [fechaReal, setFechaReal] = useState(hoyISO());
  const [avanceHectareas, setAvanceHectareas] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia()]);
  const [comentario, setComentario] = useState("");

  // ---- Editar reporte existente ----
  const [editando, setEditando] = useState<string | null>(null);
  const [editAvanceHectareas, setEditAvanceHectareas] = useState("");
  const [editLineas, setEditLineas] = useState<LineaForm[]>([]);
  const [editComentario, setEditComentario] = useState("");

  // Las "vencida" (liberadas) y "cancelada" no se muestran por default —
  // se quedaban en la lista para siempre (31-ago-2026, reportado por
  // Diego). Siguen existiendo, solo se piden aparte con este toggle.
  const [mostrarCerradas, setMostrarCerradas] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  function cargar() {
    setCargando(true);
    api
      .get<Aplicacion[]>(`/aplicaciones${mostrarCerradas ? "?incluirCerradas=true" : ""}`)
      .then(setAplicaciones)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [mostrarCerradas]);

  useEffect(() => {
    if (idResaltado) refResaltada.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [idResaltado, aplicaciones]);

  useEffect(() => {
    api.get<IngredienteAutorizado[]>("/aplicaciones/productos").then(setIngredientes);
    api.get<Equipo[]>("/aplicaciones/equipos-tractor").then(setTractores);
    api.get<Equipo[]>("/aplicaciones/equipos-implemento").then(setImplementos);
  }, []);

  useEffect(() => {
    if (!huertaId) {
      setCuadrosHuerta([]);
      return;
    }
    api.get<Cuadro[]>(`/cuadros?huertaId=${huertaId}`).then(setCuadrosHuerta);
  }, [huertaId]);

  function alternarCuadro(id: string) {
    setCuadroIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  // Atajo "toda la Huerta" (16-ago-2026): mismo cuadroIds que marcar cada
  // Cuadro a mano — no cambia ninguna lógica de negocio.
  function alternarTodaLaHuerta() {
    setCuadroIds((prev) => (prev.length === cuadrosHuerta.length ? [] : cuadrosHuerta.map((c) => c.id)));
  }

  function actualizarProductoForm(index: number, cambios: Partial<ProductoForm>) {
    setProductosForm((prev) => prev.map((p, i) => (i !== index ? p : { ...p, ...cambios })));
  }

  function agregarProductoForm() {
    setProductosForm((prev) => [...prev, productoFormVacio()]);
  }

  function quitarProductoForm(index: number) {
    setProductosForm((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  // Recetario (20-ago-2026): precarga productos + litros/ha de la receta
  // elegida — el campo queda editable, no bloqueado (el candado real de
  // quién puede tocarlo es de rol, ver `disabled` en los inputs de abajo).
  function elegirReceta(id: string) {
    setRecetaId(id);
    if (!id) return;
    const receta = recetas.find((r) => r.id === id);
    if (!receta) return;
    setLitrosMezclaPorHa(String(receta.litrosPorHa));
    setProductosForm(
      receta.productos.map((p) => ({
        ingredienteActivoNombre: p.producto.ingredienteActivo ?? "",
        concentracionValor: String(p.concentracionValor),
        concentracionUnidad: p.concentracionUnidad,
      }))
    );
    // Precarga el Tipo de aplicación de la receta (25-ago-2026) — sigue
    // siendo editable después, no es parte del candado de dosis.
    if (receta.tipoAplicacionId) setTipoAplicacionId(receta.tipoAplicacionId);
  }

  async function agregarTipoAplicacionNuevo() {
    if (!nuevoTipoAplicacion.trim()) return;
    const creado = await agregarTipoAplicacion(nuevoTipoAplicacion.trim());
    setTipoAplicacionId(creado.id);
    setNuevoTipoAplicacion("");
    setMostrarNuevoTipoAplicacion(false);
  }

  // ¿La dosis actual del formulario ya no coincide con la receta elegida?
  // Determina si hace falta preguntar "solo esta vez" vs "receta original".
  function huboDesvioDeReceta(): boolean {
    if (!recetaId) return false;
    const receta = recetas.find((r) => r.id === recetaId);
    if (!receta) return false;
    if (Number(receta.litrosPorHa) !== Number(litrosMezclaPorHa)) return true;
    if (receta.productos.length !== productosForm.length) return true;
    return receta.productos.some((rp) => {
      const actual = productosForm.find((p) => p.ingredienteActivoNombre === rp.producto.ingredienteActivo);
      return !actual || Number(rp.concentracionValor) !== Number(actual.concentracionValor) || rp.concentracionUnidad !== actual.concentracionUnidad;
    });
  }

  // V1 P2 (25-sep-2026, Bloque 3): esta pantalla todavía arma un único Grupo
  // con todos los Cuadros elegidos (a su superficie completa) — el modelo
  // ya soporta varios Grupos/modo Por Variedad, la pantalla para armarlos
  // queda pendiente.
  function construirPayload(actualizarRecetaOriginal?: boolean) {
    return {
      modo: "por_cuadro" as const,
      grupos: [
        {
          litrosMezclaPorHa: Number(litrosMezclaPorHa),
          cuadros: cuadroIds.map((cuadroId) => {
            const cuadro = cuadrosHuerta.find((c) => c.id === cuadroId);
            const vigente = cuadro?.versiones.find((v) => v.vigenteHasta == null) ?? cuadro?.versiones[0];
            return { cuadroId, hectareas: Number(vigente?.hectareas ?? 0) };
          }),
          productos: productosForm.map((p) => ({
            ingredienteActivoNombre: p.ingredienteActivoNombre,
            concentracionValor: Number(p.concentracionValor),
            concentracionUnidad: p.concentracionUnidad,
          })),
        },
      ],
      recursoSugerido,
      fechaInicio,
      fechaFin,
      recetaId: recetaId || undefined,
      capacidadTanque: capacidadTanque ? Number(capacidadTanque) : undefined,
      actualizarRecetaOriginal,
      tipoAplicacionId: tipoAplicacionId || undefined,
    };
  }

  function limpiarFormProgramar() {
    setMostrarForm(false);
    setEditandoProgramadaId(null);
    setCuadroIds([]);
    setProductosForm([productoFormVacio()]);
    setLitrosMezclaPorHa("");
    setFechaInicio(hoyISO());
    setFechaFin(hoyISO());
    setRecetaId("");
    setCapacidadTanque("");
    setTipoAplicacionId("");
  }

  async function enviarProgramacion(actualizarRecetaOriginal?: boolean) {
    setError(null);
    setConfirmandoDesvioReceta(false);
    const payload = construirPayload(actualizarRecetaOriginal);
    try {
      if (editandoProgramadaId) {
        await api.patch(`/aplicaciones/${editandoProgramadaId}`, payload);
      } else {
        await api.post("/aplicaciones", { huertaId, ...payload });
      }
      limpiarFormProgramar();
      cargar();
      if (actualizarRecetaOriginal) refetchRecetas();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la aplicación.");
    }
  }

  function programar(e: FormEvent) {
    e.preventDefault();
    // Solo pregunta si de verdad puede ajustar la receta y de verdad ajustó
    // algo — si no hay receta elegida, o no cambió nada, se guarda directo.
    if (recetaId && puedeAjustarReceta && huboDesvioDeReceta()) {
      setConfirmandoDesvioReceta(true);
      return;
    }
    enviarProgramacion(false);
  }

  // Edición asume un único Grupo (mismo alcance que el formulario — ver
  // nota en construirPayload). Si la Aplicación ya tiene varios Grupos
  // (creados por otra vía), edítala solo si de verdad es de un Grupo.
  function iniciarEdicionProgramada(a: Aplicacion) {
    const grupo = a.grupos[0];
    setEditandoProgramadaId(a.id);
    setHuertaId(a.huertaId);
    setCuadroIds(grupo ? grupo.cuadros.map((c) => c.cuadro.id) : []);
    setProductosForm(
      (grupo?.productos ?? []).map((p) => ({
        ingredienteActivoNombre: p.producto.ingredienteActivo ?? "",
        concentracionValor: String(p.concentracionValor),
        concentracionUnidad: p.concentracionUnidad,
      }))
    );
    setRecursoSugerido(a.recursoSugerido);
    setLitrosMezclaPorHa(grupo ? String(grupo.litrosMezclaPorHa) : "");
    setFechaInicio(a.fechaInicio.slice(0, 10));
    setFechaFin(a.fechaFin.slice(0, 10));
    setRecetaId(a.recetaId ?? "");
    setCapacidadTanque(a.capacidadTanque ?? "");
    setTipoAplicacionId(a.tipoAplicacionId ?? "");
    setError(null);
    setMostrarForm(true);
  }

  async function verOrden(a: Aplicacion) {
    setError(null);
    try {
      const orden = await api.get<OrdenAplicacion>(`/aplicaciones/${a.id}/orden`);
      setOrdenData(orden);
      setVerOrdenId(a.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar la Orden de Aplicación.");
    }
  }

  async function abrirEntregar(a: Aplicacion) {
    setError(null);
    setEntregandoError(null);
    setOverridesEntrega({});
    setEntregandoId(a.id);
    const opciones = await api.get<OpcionLoteEntrega[]>(`/aplicaciones/${a.id}/opciones-lote-entrega`);
    setOpcionesEntrega(opciones);
  }

  function elegirOtroLote(productoId: string, loteId: string) {
    setOverridesEntrega((prev) => ({ ...prev, [productoId]: { loteIdElegido: loteId, motivo: prev[productoId]?.motivo ?? "" } }));
  }

  function quitarOverride(productoId: string) {
    setOverridesEntrega((prev) => {
      const { [productoId]: _quitar, ...resto } = prev;
      return resto;
    });
  }

  async function confirmarEntregarConLotes() {
    if (!entregandoId) return;
    const faltaMotivo = Object.values(overridesEntrega).some((o) => !o.motivo.trim());
    if (faltaMotivo) {
      setEntregandoError("Captura el motivo de por qué se eligió otro lote.");
      return;
    }
    setEntregandoProcesando(true);
    setEntregandoError(null);
    try {
      const overrides = Object.keys(overridesEntrega).length > 0 ? overridesEntrega : undefined;
      await api.post(`/aplicaciones/${entregandoId}/entregar`, { overridesPorProducto: overrides });
      setEntregandoId(null);
      cargar();
    } catch (err) {
      setEntregandoError(err instanceof ApiError ? err.message : "No se pudo confirmar la entrega.");
    } finally {
      setEntregandoProcesando(false);
    }
  }

  async function liberar(id: string) {
    setError(null);
    try {
      await api.post(`/aplicaciones/${id}/liberar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo liberar.");
    }
  }

  // Precarga (9.7, 10-ago-2026): el reporte de un nuevo día se pre-llena con
  // las mismas líneas del reporte anterior de esta misma Aplicación (mismas
  // personas en Mochila/Aguilón, mismo Tractor+Operador+Implemento en
  // Turbina/Aguilón) — el Supervisor solo ajusta lo que cambió (quitar a
  // quien no vino, cambiar de tractorista, horas, etc.), sin afectar el
  // registro de días anteriores.
  function abrirRegistrar(a: Aplicacion) {
    setRegistrando(a.id);
    setFechaReal(hoyISO());
    setAvanceHectareas("");
    setComentario("");
    const ultimo = a.realizadas[0];
    setLineas(ultimo ? lineasDesdeExistentes(ultimo.lineas) : [lineaVacia()]);
  }

  function lineasParaEnviar(form: LineaForm[]) {
    return form.map((l) => ({
      modalidad: l.modalidad,
      tractorId: l.modalidad !== "mochila" ? l.tractorId : undefined,
      operadorId: l.modalidad !== "mochila" ? l.operadorId : undefined,
      implementoId: l.modalidad !== "mochila" ? l.implementoId : undefined,
      horas: Number(l.horas),
      personalIds: l.personalIds,
    }));
  }

  async function confirmarRegistrar(a: Aplicacion) {
    setError(null);
    if (!avanceHectareas || Number(avanceHectareas) <= 0) {
      setError("Captura las hectáreas avanzadas en este reporte.");
      return;
    }
    const errorLineas = validarLineasForm(lineas);
    if (errorLineas) {
      setError(errorLineas);
      return;
    }

    try {
      await api.post(`/aplicaciones/${a.id}/realizada`, {
        fechaReal,
        hectareas: Number(avanceHectareas),
        lineas: lineasParaEnviar(lineas),
        comentario: comentario.trim() || undefined,
      });
      setRegistrando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    }
  }

  function abrirEditar(a: Aplicacion, r: Aplicacion["realizadas"][number]) {
    setEditando(r.id);
    setEditAvanceHectareas(r.hectareas);
    setEditLineas(lineasDesdeExistentes(r.lineas));
    setEditComentario(r.comentario ?? "");
    void a;
  }

  async function confirmarEditar(a: Aplicacion, realizadaId: string) {
    setError(null);
    if (!editAvanceHectareas || Number(editAvanceHectareas) <= 0) {
      setError("Captura las hectáreas avanzadas en este reporte.");
      return;
    }
    const errorLineas = validarLineasForm(editLineas);
    if (errorLineas) {
      setError(errorLineas);
      return;
    }
    try {
      await api.patch(`/aplicaciones/realizada/${realizadaId}`, {
        hectareas: Number(editAvanceHectareas),
        lineas: lineasParaEnviar(editLineas),
        comentario: editComentario.trim() || undefined,
      });
      setEditando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la edición.");
    }
  }

  async function cancelar(id: string, nota: string) {
    setError(null);
    await api.post(`/aplicaciones/${id}/cancelar`, { nota });
    cargar();
  }

  async function confirmarRecepcion(id: string) {
    setError(null);
    try {
      await api.post(`/aplicaciones/${id}/confirmar-recepcion-cancelacion`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar.");
    }
  }

  // Recetario como su propia pantalla (Prioridad 7.3, 4-sep-2026) — antes
  // era un acordeón que se abría encima de la lista de programaciones,
  // empujándola hacia abajo. Ahora reemplaza la pantalla completa, con su
  // propio "← Volver", como ya hace Inventario con el detalle de un Producto.
  if (mostrarHistorial) {
    return (
      <div>
        <h2 style={{ marginBottom: 16 }}>Historial de Aplicaciones</h2>
        <button className="btn-secondary" onClick={() => setMostrarHistorial(false)} style={{ marginBottom: 14 }}>
          ← Volver a Aplicaciones
        </button>
        <HistorialAplicaciones />
      </div>
    );
  }

  if (mostrarRecetario) {
    return (
      <div>
        <h2 style={{ marginBottom: 16 }}>Aplicaciones</h2>
        <button className="btn-secondary" onClick={() => setMostrarRecetario(false)} style={{ marginBottom: 14 }}>
          ← Volver a Aplicaciones
        </button>
        <RecetarioPanel modulo="aplicaciones" ingredientes={ingredientes} recetas={recetas} cargando={cargandoRecetas} refetch={refetchRecetas} />
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Aplicaciones</h2>

      <div style={{ marginBottom: 14, display: "flex", gap: 10 }}>
        <button
          className="btn-primary"
          onClick={() => {
            if (mostrarForm) {
              setEditandoProgramadaId(null);
              setCuadroIds([]);
              setProductosForm([productoFormVacio()]);
              setLitrosMezclaPorHa("");
            }
            setMostrarForm((v) => !v);
          }}
        >
          {mostrarForm ? "Cancelar" : "+ Programar aplicación"}
        </button>
        <button className="btn-secondary" onClick={() => setMostrarRecetario(true)}>
          Recetario
        </button>
        <button className="btn-secondary" onClick={() => setMostrarHistorial(true)}>
          Historial
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-soft)" }}>
          <input type="checkbox" checked={mostrarCerradas} onChange={(e) => setMostrarCerradas(e.target.checked)} />
          Mostrar vencidas/canceladas
        </label>
      </div>

      {mostrarForm && (
        <form onSubmit={programar} className="card" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="field">
              Huerta
              <select
                value={huertaId}
                onChange={(e) => { setHuertaId(e.target.value); setCuadroIds([]); }}
                required
                disabled={!!editandoProgramadaId}
              >
                <option value="">Selecciona…</option>
                {huertas.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Usar receta (opcional)
              <select value={recetaId} onChange={(e) => elegirReceta(e.target.value)}>
                <option value="">Ninguna — programar libre</option>
                {recetas.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {huertaId && (
            <div className="field">
              Cuadros
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {cuadrosHuerta.length > 0 && (
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
                    <input type="checkbox" checked={cuadroIds.length === cuadrosHuerta.length} onChange={alternarTodaLaHuerta} />
                    Toda la Huerta
                  </label>
                )}
                {cuadrosHuerta.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--ink)" }}>
                    <input type="checkbox" checked={cuadroIds.includes(c.id)} onChange={() => alternarCuadro(c.id)} />
                    {c.nombre}
                  </label>
                ))}
                {cuadrosHuerta.length === 0 && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Esta Huerta no tiene Cuadros.</span>}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="field">
              Recurso sugerido
              <select value={recursoSugerido} onChange={(e) => setRecursoSugerido(e.target.value as ModalidadAplicacion)}>
                <option value="mochila">Mochila</option>
                <option value="turbina">Turbina</option>
                <option value="aguilon">Aguilón</option>
              </select>
            </label>
            <span style={{ fontSize: 11, color: "var(--ink-soft)", maxWidth: 260 }}>
              Solo referencia de cómo se planea — el detalle real se captura día a día en el reporte de avance.
            </span>
          </div>

          <div className="field">
            Productos (mismo tanque — cada uno con su propia concentración)
            {recetaId && !puedeAjustarReceta && (
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>
                Receta seleccionada — tu rol no puede ajustar la dosis, se usa tal cual está guardada.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {productosForm.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="field">
                    Ingrediente Activo (agroquímico autorizado)
                    <select
                      value={p.ingredienteActivoNombre}
                      onChange={(e) => actualizarProductoForm(i, { ingredienteActivoNombre: e.target.value })}
                      required
                      disabled={!!recetaId && !puedeAjustarReceta}
                    >
                      <option value="">Selecciona…</option>
                      {ingredientes.map((ing) => (
                        <option key={ing.ingredienteActivoNombre} value={ing.ingredienteActivoNombre}>
                          {ing.ingredienteActivoNombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Concentración
                    <input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={p.concentracionValor}
                      onChange={(e) => actualizarProductoForm(i, { concentracionValor: e.target.value })}
                      disabled={!!recetaId && !puedeAjustarReceta}
                    />
                  </label>
                  <label className="field">
                    Unidad
                    <select
                      value={p.concentracionUnidad}
                      onChange={(e) => actualizarProductoForm(i, { concentracionUnidad: e.target.value as ConcentracionUnidad })}
                      disabled={!!recetaId && !puedeAjustarReceta}
                    >
                      <option value="ml_l">ml/L</option>
                      <option value="g_l">g/L</option>
                      <option value="kg_l">kg/L</option>
                    </select>
                  </label>
                  {productosForm.length > 1 && (!recetaId || puedeAjustarReceta) && (
                    <button type="button" className="btn-secondary" onClick={() => quitarProductoForm(i)}>
                      Quitar
                    </button>
                  )}
                </div>
              ))}
            </div>
            {(!recetaId || puedeAjustarReceta) && (
              <button type="button" className="btn-secondary" style={{ marginTop: 8, width: "fit-content" }} onClick={agregarProductoForm}>
                + Otro producto
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="field">
              Litros de mezcla / ha (un solo tanque para toda la mezcla)
              <input
                type="number"
                step="0.0001"
                value={litrosMezclaPorHa}
                onChange={(e) => setLitrosMezclaPorHa(e.target.value)}
                required
                disabled={!!recetaId && !puedeAjustarReceta}
              />
            </label>
            <label className="field">
              Capacidad del tanque/recipiente (L, opcional)
              <input type="number" step="0.01" style={{ width: 140 }} value={capacidadTanque} onChange={(e) => setCapacidadTanque(e.target.value)} />
            </label>
            <label className="field">
              Tipo de aplicación
              <select value={tipoAplicacionId} onChange={(e) => setTipoAplicacionId(e.target.value)} required>
                <option value="">Selecciona…</option>
                {tiposAplicacion.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            {!mostrarNuevoTipoAplicacion ? (
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 11, padding: "4px 8px", alignSelf: "flex-end" }}
                onClick={() => setMostrarNuevoTipoAplicacion(true)}
              >
                + Tipo nuevo
              </button>
            ) : (
              <label className="field">
                + Tipo nuevo
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    value={nuevoTipoAplicacion}
                    onChange={(e) => setNuevoTipoAplicacion(e.target.value)}
                    placeholder="ej. Drench"
                    style={{ width: 120 }}
                    autoFocus
                  />
                  <button type="button" className="btn-secondary" onClick={agregarTipoAplicacionNuevo} disabled={!nuevoTipoAplicacion.trim()}>
                    +
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setMostrarNuevoTipoAplicacion(false)}>
                    Cancelar
                  </button>
                </div>
              </label>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <label className="field">
                Fecha inicio
                <FechaInput value={fechaInicio} onChange={setFechaInicio} required />
              </label>
              <label className="field">
                Fecha fin
                <FechaInput value={fechaFin} onChange={setFechaFin} required />
              </label>
            </div>
            <button className="btn-primary" type="submit">
              {editandoProgramadaId ? "Guardar cambios" : "Programar"}
            </button>
          </div>
        </form>
      )}

      {confirmandoDesvioReceta && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="card" style={{ width: 420 }}>
            <h3 style={{ marginBottom: 10 }}>Ajustaste la dosis de la receta</h3>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 16 }}>
              ¿Modificar solo para esta vez, o modificar la receta original para las próximas veces que se use?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button className="btn-secondary" onClick={() => setConfirmandoDesvioReceta(false)}>
                Cancelar
              </button>
              <button className="btn-secondary" onClick={() => enviarProgramacion(false)}>
                Solo esta vez
              </button>
              <button className="btn-primary" onClick={() => enviarProgramacion(true)}>
                Modificar receta original
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {aplicaciones.map((a) => (
            <div
              key={a.id}
              ref={a.id === idResaltado ? refResaltada : undefined}
              className="card"
              style={a.id === idResaltado ? { outline: "2px solid var(--pink)", outlineOffset: 2 } : undefined}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span className={`tag ${tagEstado(a.estado)}`}>{ETIQUETAS_ESTADO[a.estado]}</span>{" "}
                  {!a.comprometido && a.estado === "programada" && <span className="tag tag-neutral">Esperando compra automática</span>}{" "}
                  {a.alertaVencimiento && <span className="tag tag-danger">15+ días sin entregar</span>}{" "}
                  {a.alertaPendienteAplicar && <span className="tag tag-danger">15+ días entregada sin aplicar</span>}
                  {(() => {
                    const productos = a.grupos.flatMap((g) => g.productos);
                    const cuadrosNombres = a.grupos.flatMap((g) => (g.cuadros.length > 0 ? g.cuadros.map((c) => c.cuadro.nombre) : g.variedades.map((v) => `${v.cuadro.nombre} (${v.variedad})`)));
                    return (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
                          {a.huerta.nombre} — {productos.map((p) => p.producto.ingredienteActivo ?? p.producto.nombreComercial).join(" + ")}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                          {a.modo === "por_variedad" ? "Variedades" : "Cuadros"}: {cuadrosNombres.join(", ") || "—"}
                          {a.grupos.length > 1 && ` · ${a.grupos.length} Grupos de dosis`}
                        </div>
                        {productos.map((p) => (
                          <div key={p.id} style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                            {p.producto.ingredienteActivo ?? p.producto.nombreComercial}: {formatearNumero(p.cantidadTotalCalculada)} {p.producto.unidad} · {p.concentracionValor}{" "}
                            {p.concentracionUnidad.replace("_", "/")}
                          </div>
                        ))}
                        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                          {a.grupos.map((g) => `${g.litrosMezclaPorHa} L/ha`).join(" · ")} · Sugerido: {ETIQUETAS_MODALIDAD[a.recursoSugerido]} · {formatearFecha(a.fechaInicio)} a{" "}
                          {formatearFecha(a.fechaFin)}
                        </div>
                        {a.mezclaPorTanque?.map((m) => m.productos.length > 0 && (
                          <div key={m.grupoId} style={{ marginTop: 8, maxWidth: 460 }}>
                            <MezclaPorTanque
                              mezcla={m.productos}
                              capacidadTanque={Number(a.capacidadTanque)}
                              productos={productos.map((p) => ({
                                productoId: p.productoId,
                                ingredienteActivo: p.producto.ingredienteActivo,
                                nombreComercial: p.producto.nombreComercial,
                                concentracionUnidad: p.concentracionUnidad,
                              }))}
                            />
                          </div>
                        ))}
                        {a.realizadas.length > 0 && (
                          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                            {(a.porcentajeAvance ?? 0).toFixed(1)}% avance · {formatearNumero(a.horasHombreTotales ?? 0)} horas-hombre totales · {a.realizadas.length}{" "}
                            reporte{a.realizadas.length === 1 ? "" : "s"}
                          </div>
                        )}
                        {a.notaTanquePendiente?.map((n) => n.productos.length > 0 && (
                          <NotaTanquePendiente
                            key={n.grupoId}
                            nota={n.productos}
                            productos={productos.map((p) => ({
                              productoId: p.productoId,
                              ingredienteActivo: p.producto.ingredienteActivo,
                              nombreComercial: p.producto.nombreComercial,
                              concentracionUnidad: p.concentracionUnidad,
                            }))}
                          />
                        ))}
                      </>
                    );
                  })()}
                  {a.estado === "cancelada" && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                      Cancelada el {formatearInstante(a.fechaCancelacion)}
                      {a.confirmacionBodegaPorId
                        ? ` · Bodega confirmó recepción el ${formatearInstante(a.fechaConfirmacionBodega)}`
                        : " · Pendiente de confirmación de Bodega"}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {a.capacidadTanque != null && (
                    <button className="btn-secondary" onClick={() => verOrden(a)}>
                      Ver Orden
                    </button>
                  )}
                  {(a.estado === "programada" || a.estado === "entregada") && a.realizadas.length === 0 && (
                    <button className="btn-secondary" onClick={() => iniciarEdicionProgramada(a)}>
                      Editar
                    </button>
                  )}
                  {a.estado === "programada" && a.comprometido && (
                    <button className="btn-primary" onClick={() => abrirEntregar(a)}>
                      Confirmar entrega
                    </button>
                  )}
                  {a.estado === "programada" && (
                    <button className="btn-secondary" onClick={() => setConfirmando({ tipo: "liberar", id: a.id })}>
                      Liberar
                    </button>
                  )}
                  {(a.estado === "entregada" || a.estado === "realizada") && registrando !== a.id && (
                    <button className="btn-primary" onClick={() => abrirRegistrar(a)}>
                      Registrar avance
                    </button>
                  )}
                  {(a.estado === "entregada" || a.estado === "realizada") && a.alertaPendienteAplicar && (
                    <button className="btn-danger" onClick={() => setConfirmando({ tipo: "cancelar", id: a.id })}>
                      Cancelar (15+ días sin terminar)
                    </button>
                  )}
                  {a.estado === "cancelada" && !a.confirmacionBodegaPorId && (
                    <button className="btn-primary" onClick={() => confirmarRecepcion(a.id)}>
                      Bodega: confirmar recepción
                    </button>
                  )}
                </div>
              </div>

              {registrando === a.id && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <label className="field" style={{ maxWidth: 180, marginBottom: 10 }}>
                    Fecha
                    <FechaInput value={fechaReal} onChange={setFechaReal} />
                  </label>

                  <label className="field" style={{ maxWidth: 220, marginBottom: 10 }}>
                    Hectáreas avanzadas en este reporte
                    <input
                      type="number"
                      min={0}
                      step="0.0001"
                      value={avanceHectareas}
                      onChange={(e) => setAvanceHectareas(e.target.value)}
                    />
                  </label>
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 10 }}>
                    Programadas: {a.hectareasTotalesProgramadas} ha · Avanzadas hasta ahora: {formatearNumero(a.hectareasAvanzadas ?? 0)} ha — el
                    sistema reparte solo entre los Cuadros/Grupos, en proporción a lo programado.
                  </div>

                  <LineasEditor lineas={lineas} setLineas={setLineas} tractores={tractores} implementos={implementos} personal={personal} />

                  <label className="field" style={{ marginTop: 10 }}>
                    Comentario (opcional)
                    <textarea
                      rows={2}
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      placeholder="Alguna observación de este reporte…"
                    />
                  </label>

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="btn-primary" onClick={() => confirmarRegistrar(a)}>
                      Guardar
                    </button>
                    <button className="btn-secondary" onClick={() => setRegistrando(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {a.realizadas.length > 0 && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Historial de reportes</div>
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Líneas</th>
                        <th>Hectáreas</th>
                        <th>Reparto (calculado)</th>
                        <th>Comentario</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.realizadas.map((r) => (
                        <Fragment key={r.id}>
                          <tr>
                            <td>{formatearFecha(r.fechaReal)}</td>
                            <td>
                              {r.lineas
                                .map(
                                  (l) =>
                                    `${ETIQUETAS_MODALIDAD[l.modalidad]} (${l.horas}h${
                                      l.operador ? ` · ${l.operador.nombreCompleto}` : ""
                                    }${l.personas.length > 0 ? ` · ${l.personas.map((p) => p.personal.nombreCompleto).join(", ")}` : ""})`
                                )
                                .join(" + ") || "—"}
                            </td>
                            <td>{r.hectareas} ha</td>
                            <td>
                              {r.grupos
                                .flatMap((g) => g.cuadros)
                                .map((c) => `${c.cuadro.nombre}${c.variedad ? ` (${c.variedad})` : ""}: ${c.hectareasAtribuidas} ha`)
                                .join(", ") || "—"}
                            </td>
                            <td>{r.comentario || "—"}</td>
                            <td>
                              {editando !== r.id && (
                                <button className="btn-secondary" onClick={() => abrirEditar(a, r)}>
                                  Editar
                                </button>
                              )}
                            </td>
                          </tr>
                          {editando === r.id && (
                            <tr>
                              <td colSpan={6}>
                                <label className="field" style={{ maxWidth: 220, marginBottom: 10 }}>
                                  Hectáreas avanzadas en este reporte
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.0001"
                                    value={editAvanceHectareas}
                                    onChange={(e) => setEditAvanceHectareas(e.target.value)}
                                  />
                                </label>

                                <LineasEditor lineas={editLineas} setLineas={setEditLineas} tractores={tractores} implementos={implementos} personal={personal} />

                                <label className="field" style={{ marginTop: 10 }}>
                                  Comentario (opcional)
                                  <textarea rows={2} value={editComentario} onChange={(e) => setEditComentario(e.target.value)} />
                                </label>

                                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                                  <button className="btn-primary" onClick={() => confirmarEditar(a, r.id)}>
                                    Guardar cambios
                                  </button>
                                  <button className="btn-secondary" onClick={() => setEditando(null)}>
                                    Cancelar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {aplicaciones.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay aplicaciones{usuario?.huertaId ? " en tu Huerta" : ""}.</p>}
        </div>
      )}

      {verOrdenId && ordenData && (
        <OrdenAplicacionView
          aplicacionId={verOrdenId}
          orden={ordenData}
          onCerrar={() => {
            setVerOrdenId(null);
            setOrdenData(null);
          }}
        />
      )}

      {confirmando && confirmando.tipo === "liberar" && (
        <ConfirmModal
          titulo="Liberar aplicación"
          mensaje="Se libera el producto comprometido en Almacén y la programación queda como vencida — ya no se podrá entregar ni programar sobre ella. ¿Confirmar?"
          onCancelar={() => setConfirmando(null)}
          onConfirmar={async () => {
            await liberar(confirmando.id);
            setConfirmando(null);
          }}
        />
      )}
      {confirmando && confirmando.tipo === "cancelar" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 12 }}>
          <div className="card" style={{ width: 420, maxWidth: "100%" }}>
            <h3 style={{ marginBottom: 10 }}>Cancelar aplicación (cierre por debajo de 100%)</h3>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              Se regresará a bodega central el producto no aplicado y se generará un abono al Rancho. Captura la nota obligatoria de por qué se cierra sin llegar al 100%.
            </p>
            <label className="field" style={{ marginTop: 8 }}>
              Nota (obligatoria)
              <textarea rows={2} value={notaCancelacion} onChange={(e) => setNotaCancelacion(e.target.value)} />
            </label>
            {error && <p style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 8 }}>{error}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => { setConfirmando(null); setNotaCancelacion(""); }}>
                Cancelar
              </button>
              <button
                className="btn-danger"
                onClick={async () => {
                  if (!notaCancelacion.trim()) {
                    setError("La nota es obligatoria.");
                    return;
                  }
                  try {
                    await cancelar(confirmando.id, notaCancelacion.trim());
                    setConfirmando(null);
                    setNotaCancelacion("");
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "No se pudo cancelar.");
                  }
                }}
              >
                Sí, cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {entregandoId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 12 }}>
          <div className="card" style={{ width: 480, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            <h3 style={{ marginBottom: 10 }}>Confirmar entrega</h3>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>
              Por default se entrega del lote que el sistema apartó al programar. Si Bodega ya sabe que salió (o debe salir) de otro
              lote, elígelo abajo y captura el motivo.
            </p>
            {(() => {
              const productos = aplicaciones.find((a) => a.id === entregandoId)?.grupos.flatMap((g) => g.productos) ?? [];
              const unicos = [...new Map(productos.map((p) => [p.productoId, p])).values()];
              return unicos;
            })().map((p) => {
                const opciones = opcionesEntrega.find((o) => o.productoId === p.productoId);
                const override = overridesEntrega[p.productoId];
                return (
                  <div key={p.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.producto.nombreComercial}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                      {opciones && opciones.loteSugerido.length > 0
                        ? "Sugerido: " + opciones.loteSugerido.map((l) => `Lote ${l.numeroLote ?? "?"} (${formatearNumero(l.cantidad)})`).join(" + ")
                        : "Sin lote registrado (dato histórico)."}
                    </div>
                    {!override ? (
                      <button
                        className="btn-secondary"
                        style={{ marginTop: 6 }}
                        disabled={!opciones || opciones.otrosLotesConExistencia.length === 0}
                        onClick={() => elegirOtroLote(p.productoId, opciones!.otrosLotesConExistencia[0]!.loteId)}
                      >
                        Usar otro lote
                      </button>
                    ) : (
                      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <label className="field">
                          Lote elegido
                          <select value={override.loteIdElegido} onChange={(e) => elegirOtroLote(p.productoId, e.target.value)}>
                            {opciones?.otrosLotesConExistencia.map((l) => (
                              <option key={l.loteId} value={l.loteId}>
                                Lote {l.numeroLote ?? "?"} — existencia {formatearNumero(l.cantidadActual)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field" style={{ minWidth: 200 }}>
                          Motivo
                          <input
                            value={override.motivo}
                            onChange={(e) => setOverridesEntrega((prev) => ({ ...prev, [p.productoId]: { ...prev[p.productoId]!, motivo: e.target.value } }))}
                          />
                        </label>
                        <button className="btn-secondary" onClick={() => quitarOverride(p.productoId)}>
                          Cancelar cambio
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            {entregandoError && <p style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 10 }}>{entregandoError}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setEntregandoId(null)} disabled={entregandoProcesando}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={confirmarEntregarConLotes} disabled={entregandoProcesando}>
                {entregandoProcesando ? "Procesando…" : "Confirmar entrega"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Captura de maquinaria y personas por reporte (9.7, 8-ago-2026): una o
 * varias líneas, cada una con su propia modalidad — se pueden combinar
 * dentro del mismo reporte (ej. una cuadrilla con Mochila y otra con
 * Aguilón el mismo día).
 */
function LineasEditor({
  lineas,
  setLineas,
  tractores,
  implementos,
  personal,
}: {
  lineas: LineaForm[];
  setLineas: (updater: (prev: LineaForm[]) => LineaForm[]) => void;
  tractores: Equipo[];
  implementos: Equipo[];
  personal: { id: string; nombreCompleto: string }[];
}) {
  function actualizar(key: string, cambios: Partial<LineaForm>) {
    setLineas((prev) => prev.map((l) => (l.key !== key ? l : { ...l, ...cambios })));
  }

  function agregarPersona(key: string, personalId: string) {
    if (!personalId) return;
    setLineas((prev) => prev.map((l) => (l.key !== key || l.personalIds.includes(personalId) ? l : { ...l, personalIds: [...l.personalIds, personalId] })));
  }

  function quitarPersona(key: string, personalId: string) {
    setLineas((prev) => prev.map((l) => (l.key !== key ? l : { ...l, personalIds: l.personalIds.filter((id) => id !== personalId) })));
  }

  function elegirTractor(key: string, tractorId: string) {
    // Precarga del operador designado (9.13, 15-ago-2026) — solo sugiere,
    // editable libremente sin afectar el default guardado en la ficha.
    const designado = tractores.find((t) => t.id === tractorId)?.operadorDesignadoId ?? "";
    actualizar(key, { tractorId, operadorId: designado });
  }

  function agregarLinea() {
    setLineas((prev) => [...prev, lineaVacia()]);
  }

  function quitarLinea(key: string) {
    setLineas((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 8 }}>
        Recurso real usado — una línea por modalidad, se pueden combinar varias en el mismo reporte.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {lineas.map((l) => (
          <div key={l.key} className="card" style={{ background: "var(--surface-soft, #fafafa)" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
              <label className="field">
                Modalidad
                <select value={l.modalidad} onChange={(e) => actualizar(l.key, { modalidad: e.target.value as ModalidadAplicacion, personalIds: [] })}>
                  <option value="mochila">Mochila</option>
                  <option value="turbina">Turbina</option>
                  <option value="aguilon">Aguilón</option>
                </select>
              </label>
              <label className="field">
                Horas
                <input type="number" step="0.25" style={{ width: 90 }} value={l.horas} onChange={(e) => actualizar(l.key, { horas: e.target.value })} />
              </label>
              {lineas.length > 1 && (
                <button className="btn-secondary" onClick={() => quitarLinea(l.key)}>
                  Quitar línea
                </button>
              )}
            </div>

            {l.modalidad !== "mochila" && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <label className="field">
                  Tractor
                  <select value={l.tractorId} onChange={(e) => elegirTractor(l.key, e.target.value)}>
                    <option value="">Selecciona…</option>
                    {tractores.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.folio} {eq.marca ?? ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Operador
                  <select value={l.operadorId} onChange={(e) => actualizar(l.key, { operadorId: e.target.value })}>
                    <option value="">Selecciona…</option>
                    {personal.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombreCompleto}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Implemento
                  <select value={l.implementoId} onChange={(e) => actualizar(l.key, { implementoId: e.target.value })}>
                    <option value="">Selecciona…</option>
                    {implementos.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.folio} {eq.marca ?? ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {l.modalidad !== "turbina" && (
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>
                  {l.modalidad === "mochila" ? "Personas de esta línea" : "Personas detrás del tractor"}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {l.personalIds.map((id) => {
                    const p = personal.find((x) => x.id === id);
                    return (
                      <span key={id} className="tag tag-neutral" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {p?.nombreCompleto ?? id}
                        <button
                          type="button"
                          onClick={() => quitarPersona(l.key, id)}
                          style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontWeight: 700 }}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
                <select value="" onChange={(e) => agregarPersona(l.key, e.target.value)}>
                  <option value="">+ Agregar persona…</option>
                  {personal
                    .filter((p) => !l.personalIds.includes(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombreCompleto}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="btn-secondary" style={{ marginTop: 8 }} onClick={agregarLinea}>
        + Otra línea
      </button>
    </div>
  );
}
