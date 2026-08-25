import { Fragment, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useHuertas } from "../../lib/useHuertas";
import { usePersonal } from "../../lib/usePersonal";
import { useRecetas } from "../../lib/useRecetas";
import type { Aplicacion, AplicacionRealizadaLinea, ConcentracionUnidad, Cuadro, Equipo, ModalidadAplicacion, Producto } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha, formatearInstante } from "../../lib/fecha";
import { presentacionTexto } from "../../lib/producto";
import RecetarioPanel, { ROLES_PUEDEN_RECETAS } from "../../components/RecetarioPanel";
import MezclaPorTanque from "../../components/MezclaPorTanque";

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

function formaEntero(valor: string): string {
  const n = Number(valor);
  return Number.isFinite(n) ? n.toLocaleString("es-MX", { maximumFractionDigits: 3 }) : valor;
}

let contadorKey = 0;
function nuevaKey(): string {
  contadorKey += 1;
  return `linea-${Date.now()}-${contadorKey}`;
}

interface ProductoForm {
  productoId: string;
  concentracionValor: string;
  concentracionUnidad: ConcentracionUnidad;
}

function productoFormVacio(): ProductoForm {
  return { productoId: "", concentracionValor: "", concentracionUnidad: "ml_l" };
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

  // ---- Programar ----
  const [mostrarForm, setMostrarForm] = useState(false);
  const [productos, setProductos] = useState<Producto[]>([]);
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

  // ---- Recetario (20-ago-2026) ----
  const [recetaId, setRecetaId] = useState("");
  const [capacidadTanque, setCapacidadTanque] = useState("");
  // Si el rol autorizado ajustó una dosis respecto a la receta elegida, se
  // pregunta antes de guardar — no en cada tecla, para no interrumpir.
  const [confirmandoDesvioReceta, setConfirmandoDesvioReceta] = useState(false);

  // ---- Equipos para líneas de Turbina/Aguilón ----
  const [tractores, setTractores] = useState<Equipo[]>([]);
  const [implementos, setImplementos] = useState<Equipo[]>([]);

  // ---- Registrar realizada ----
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [fechaReal, setFechaReal] = useState(hoyISO());
  const [avanceCuadros, setAvanceCuadros] = useState<Record<string, string>>({});
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia()]);

  // ---- Editar reporte existente ----
  const [editando, setEditando] = useState<string | null>(null);
  const [editAvanceCuadros, setEditAvanceCuadros] = useState<Record<string, string>>({});
  const [editLineas, setEditLineas] = useState<LineaForm[]>([]);

  function cargar() {
    setCargando(true);
    api
      .get<Aplicacion[]>("/aplicaciones")
      .then(setAplicaciones)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  useEffect(() => {
    api.get<Producto[]>("/aplicaciones/productos").then(setProductos);
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
    setProductosForm(receta.productos.map((p) => ({ productoId: p.productoId, concentracionValor: String(p.concentracionValor), concentracionUnidad: p.concentracionUnidad })));
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
      const actual = productosForm.find((p) => p.productoId === rp.productoId);
      return !actual || Number(rp.concentracionValor) !== Number(actual.concentracionValor) || rp.concentracionUnidad !== actual.concentracionUnidad;
    });
  }

  function construirPayload(actualizarRecetaOriginal?: boolean) {
    return {
      cuadroIds,
      productos: productosForm.map((p) => ({
        productoId: p.productoId,
        concentracionValor: Number(p.concentracionValor),
        concentracionUnidad: p.concentracionUnidad,
      })),
      recursoSugerido,
      litrosMezclaPorHa: Number(litrosMezclaPorHa),
      fechaInicio,
      fechaFin,
      recetaId: recetaId || undefined,
      capacidadTanque: capacidadTanque ? Number(capacidadTanque) : undefined,
      actualizarRecetaOriginal,
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

  function iniciarEdicionProgramada(a: Aplicacion) {
    setEditandoProgramadaId(a.id);
    setHuertaId(a.huertaId);
    setCuadroIds(a.cuadros.map((c) => c.cuadro.id));
    setProductosForm(
      a.productos.map((p) => ({ productoId: p.productoId, concentracionValor: String(p.concentracionValor), concentracionUnidad: p.concentracionUnidad }))
    );
    setRecursoSugerido(a.recursoSugerido);
    setLitrosMezclaPorHa(String(a.litrosMezclaPorHa));
    setFechaInicio(a.fechaInicio.slice(0, 10));
    setFechaFin(a.fechaFin.slice(0, 10));
    setRecetaId(a.recetaId ?? "");
    setCapacidadTanque(a.capacidadTanque ?? "");
    setError(null);
    setMostrarForm(true);
  }

  async function entregar(id: string) {
    setError(null);
    try {
      await api.post(`/aplicaciones/${id}/entregar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar la entrega.");
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
    setAvanceCuadros({});
    const ultimo = a.realizadas[0];
    setLineas(ultimo ? lineasDesdeExistentes(ultimo.lineas) : [lineaVacia()]);
  }

  function cuadrosDesdeMapa(mapa: Record<string, string>, restantes: Record<string, number> | undefined): { cuadroId: string; hectareas: number }[] {
    return Object.entries(mapa)
      .filter(([, hectareas]) => hectareas !== undefined)
      .map(([cuadroId, hectareas]) => ({
        cuadroId,
        hectareas: hectareas === "" ? restantes?.[cuadroId] ?? 0 : Number(hectareas),
      }))
      .filter((c) => c.hectareas > 0);
  }

  function resumenConfirmacion(a: Aplicacion, mapa: Record<string, string>): string {
    const lineasResumen = Object.entries(mapa)
      .filter(([, hectareas]) => hectareas === "")
      .map(([cuadroId]) => {
        const nombre = a.cuadros.find((c) => c.cuadro.id === cuadroId)?.cuadro.nombre ?? cuadroId;
        const ha = a.restantesPorCuadro?.[cuadroId] ?? 0;
        return `${nombre}: se marca completo (${ha.toFixed(2)} ha)`;
      });
    if (lineasResumen.length === 0) return "";
    return `Vas a dar por completados estos Cuadros:\n\n${lineasResumen.join("\n")}\n\n¿Confirmar?`;
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
    const cuadros = cuadrosDesdeMapa(avanceCuadros, a.restantesPorCuadro);
    if (cuadros.length === 0) {
      setError("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");
      return;
    }
    const errorLineas = validarLineasForm(lineas);
    if (errorLineas) {
      setError(errorLineas);
      return;
    }
    const resumen = resumenConfirmacion(a, avanceCuadros);
    if (resumen && !confirm(resumen)) return;

    try {
      await api.post(`/aplicaciones/${a.id}/realizada`, { fechaReal, cuadros, lineas: lineasParaEnviar(lineas) });
      setRegistrando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    }
  }

  function abrirEditar(a: Aplicacion, r: Aplicacion["realizadas"][number]) {
    setEditando(r.id);
    const mapa: Record<string, string> = {};
    for (const c of r.cuadros) mapa[c.cuadroId] = c.hectareas;
    setEditAvanceCuadros(mapa);
    setEditLineas(lineasDesdeExistentes(r.lineas));
    void a;
  }

  async function confirmarEditar(a: Aplicacion, realizadaId: string) {
    setError(null);
    const cuadros = cuadrosDesdeMapa(editAvanceCuadros, a.restantesPorCuadro);
    if (cuadros.length === 0) {
      setError("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");
      return;
    }
    const errorLineas = validarLineasForm(editLineas);
    if (errorLineas) {
      setError(errorLineas);
      return;
    }
    try {
      await api.patch(`/aplicaciones/realizada/${realizadaId}`, { cuadros, lineas: lineasParaEnviar(editLineas) });
      setEditando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la edición.");
    }
  }

  async function cancelar(id: string) {
    if (!confirm("¿Cancelar esta aplicación? Se regresará a bodega central el producto no aplicado y se generará un abono al Rancho.")) return;
    setError(null);
    try {
      await api.post(`/aplicaciones/${id}/cancelar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cancelar.");
    }
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
        <button className="btn-secondary" onClick={() => setMostrarRecetario((v) => !v)}>
          {mostrarRecetario ? "Ocultar Recetario" : "Recetario"}
        </button>
      </div>

      {mostrarRecetario && (
        <RecetarioPanel modulo="aplicaciones" productos={productos} recetas={recetas} cargando={cargandoRecetas} refetch={refetchRecetas} />
      )}

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
                    Producto (agroquímico autorizado)
                    <select
                      value={p.productoId}
                      onChange={(e) => actualizarProductoForm(i, { productoId: e.target.value })}
                      required
                      disabled={!!recetaId && !puedeAjustarReceta}
                    >
                      <option value="">Selecciona…</option>
                      {productos.map((prod) => (
                        <option key={prod.id} value={prod.id}>
                          {prod.nombreComercial} ({presentacionTexto(prod)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Concentración
                    <input
                      type="number"
                      step="0.0001"
                      style={{ width: 100 }}
                      value={p.concentracionValor}
                      onChange={(e) => actualizarProductoForm(i, { concentracionValor: e.target.value })}
                      required
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
              Fecha inicio
              <FechaInput value={fechaInicio} onChange={setFechaInicio} required />
            </label>
            <label className="field">
              Fecha fin
              <FechaInput value={fechaFin} onChange={setFechaFin} required />
            </label>
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
            <div key={a.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span className={`tag ${tagEstado(a.estado)}`}>{ETIQUETAS_ESTADO[a.estado]}</span>{" "}
                  {!a.comprometido && a.estado === "programada" && <span className="tag tag-neutral">Esperando compra automática</span>}{" "}
                  {a.alertaVencimiento && <span className="tag tag-danger">15+ días sin entregar</span>}{" "}
                  {a.alertaPendienteAplicar && <span className="tag tag-danger">15+ días entregada sin aplicar</span>}
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
                    {a.huerta.nombre} — {a.productos.map((p) => p.producto.nombreComercial).join(" + ")}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    Cuadros: {a.cuadros.map((c) => c.cuadro.nombre).join(", ") || "—"}
                  </div>
                  {a.productos.map((p) => (
                    <div key={p.id} style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      {p.producto.nombreComercial}: {formaEntero(p.cantidadTotalCalculada)} {p.producto.unidad} · {p.concentracionValor}{" "}
                      {p.concentracionUnidad.replace("_", "/")}
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {a.litrosMezclaPorHa} L mezcla/ha · Sugerido: {ETIQUETAS_MODALIDAD[a.recursoSugerido]} · {formatearFecha(a.fechaInicio)} a{" "}
                    {formatearFecha(a.fechaFin)}
                  </div>
                  {a.mezclaPorTanque && a.mezclaPorTanque.length > 0 && (
                    <div style={{ marginTop: 8, maxWidth: 460 }}>
                      <MezclaPorTanque
                        mezcla={a.mezclaPorTanque}
                        capacidadTanque={Number(a.capacidadTanque)}
                        productos={a.productos.map((p) => ({ productoId: p.productoId, nombreComercial: p.producto.nombreComercial, concentracionUnidad: p.concentracionUnidad }))}
                      />
                    </div>
                  )}
                  {a.realizadas.length > 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                      {(a.porcentajeAvance ?? 0).toFixed(1)}% avance · {a.horasHombreTotales ?? 0} horas-hombre totales · {a.realizadas.length}{" "}
                      reporte{a.realizadas.length === 1 ? "" : "s"}
                    </div>
                  )}
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
                  {(a.estado === "programada" || a.estado === "entregada") && a.realizadas.length === 0 && (
                    <button className="btn-secondary" onClick={() => iniciarEdicionProgramada(a)}>
                      Editar
                    </button>
                  )}
                  {a.estado === "programada" && a.comprometido && (
                    <button className="btn-primary" onClick={() => entregar(a.id)}>
                      Confirmar entrega
                    </button>
                  )}
                  {a.estado === "programada" && (
                    <button className="btn-secondary" onClick={() => liberar(a.id)}>
                      Liberar
                    </button>
                  )}
                  {(a.estado === "entregada" || a.estado === "realizada") && registrando !== a.id && (
                    <button className="btn-primary" onClick={() => abrirRegistrar(a)}>
                      Registrar avance
                    </button>
                  )}
                  {(a.estado === "entregada" || a.estado === "realizada") && a.alertaPendienteAplicar && (
                    <button className="btn-danger" onClick={() => cancelar(a.id)}>
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

                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 6 }}>
                    ¿Qué Cuadro(s) se avanzaron en este reporte, y cuántas hectáreas de cada uno? (deja el número en blanco para marcarlo completo)
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                    {a.cuadros.map(({ cuadro }) => {
                      const restan = a.restantesPorCuadro?.[cuadro.id];
                      return (
                        <label key={cuadro.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                          <input
                            type="checkbox"
                            checked={avanceCuadros[cuadro.id] !== undefined}
                            onChange={(e) =>
                              setAvanceCuadros((prev) => {
                                const copia = { ...prev };
                                if (e.target.checked) copia[cuadro.id] = "";
                                else delete copia[cuadro.id];
                                return copia;
                              })
                            }
                          />
                          {cuadro.nombre} {restan !== undefined && <span style={{ color: "var(--ink-soft)" }}>(quedan {restan.toFixed(2)} ha)</span>}
                          {avanceCuadros[cuadro.id] !== undefined && (
                            <input
                              type="number"
                              min={0}
                              step="0.0001"
                              placeholder={restan !== undefined ? `${restan.toFixed(2)} (completo)` : "ha"}
                              style={{ width: 110 }}
                              value={avanceCuadros[cuadro.id]}
                              onChange={(e) => setAvanceCuadros((prev) => ({ ...prev, [cuadro.id]: e.target.value }))}
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>

                  <LineasEditor lineas={lineas} setLineas={setLineas} tractores={tractores} implementos={implementos} personal={personal} />

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
                        <th>Cuadros avanzados</th>
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
                            <td>{r.cuadros.map((c) => `${c.cuadro.nombre} (${c.hectareas} ha)`).join(", ") || "—"}</td>
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
                              <td colSpan={4}>
                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                                  {a.cuadros.map(({ cuadro }) => {
                                    const restan = a.restantesPorCuadro?.[cuadro.id];
                                    return (
                                      <label key={cuadro.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                                        <input
                                          type="checkbox"
                                          checked={editAvanceCuadros[cuadro.id] !== undefined}
                                          onChange={(e) =>
                                            setEditAvanceCuadros((prev) => {
                                              const copia = { ...prev };
                                              if (e.target.checked) copia[cuadro.id] = "";
                                              else delete copia[cuadro.id];
                                              return copia;
                                            })
                                          }
                                        />
                                        {cuadro.nombre} {restan !== undefined && <span style={{ color: "var(--ink-soft)" }}>(quedan {restan.toFixed(2)} ha)</span>}
                                        {editAvanceCuadros[cuadro.id] !== undefined && (
                                          <input
                                            type="number"
                                            min={0}
                                            step="0.0001"
                                            placeholder="ha"
                                            style={{ width: 80 }}
                                            value={editAvanceCuadros[cuadro.id]}
                                            onChange={(e) => setEditAvanceCuadros((prev) => ({ ...prev, [cuadro.id]: e.target.value }))}
                                          />
                                        )}
                                      </label>
                                    );
                                  })}
                                </div>

                                <LineasEditor lineas={editLineas} setLineas={setEditLineas} tractores={tractores} implementos={implementos} personal={personal} />

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
