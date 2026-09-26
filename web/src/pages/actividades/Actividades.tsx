import { Fragment, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useHuertas } from "../../lib/useHuertas";
import { usePersonal } from "../../lib/usePersonal";
import { useEquipos } from "../../lib/useEquipos";
import { useProductos } from "../../lib/useProductos";
import { subirEvidencia } from "../../lib/subirEvidencia";
import type { Actividad, ActividadProgramada, ActividadRealizadaLinea, Cuadro, TipoRecursoActividad } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";
import { formatearNumero } from "../../lib/numero";

const ETIQUETAS_TIPO: Record<TipoRecursoActividad, string> = {
  gente: "Gente",
  tractor: "Tractor",
  mixta: "Mixta",
};

function hoyISO(): string {
  const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formaDinero(valor: number): string {
  return valor.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

let contadorKey = 0;
function nuevaKey(): string {
  contadorKey += 1;
  return `linea-${Date.now()}-${contadorKey}`;
}

interface PersonaLineaForm {
  personalId: string;
  horas: string;
}

interface LineaForm {
  key: string;
  tipo: TipoRecursoActividad;
  tractorId: string;
  operadorId: string;
  operadorHoras: string;
  implementoId: string;
  personas: PersonaLineaForm[];
  // Relleno de diésel de esta línea (V1 P3, 26-sep-2026) — Tractor/Mixta.
  combustibleProductoId: string;
  combustibleLitros: string;
  combustibleArchivo: File | null;
}

function lineaVacia(tipoDefault: TipoRecursoActividad): LineaForm {
  return {
    key: nuevaKey(),
    tipo: tipoDefault,
    tractorId: "",
    operadorId: "",
    operadorHoras: "",
    implementoId: "",
    personas: [],
    combustibleProductoId: "",
    combustibleLitros: "",
    combustibleArchivo: null,
  };
}

function lineasDesdeExistentes(lineas: ActividadRealizadaLinea[]): LineaForm[] {
  return lineas.map((l) => ({
    key: nuevaKey(),
    tipo: l.tipo,
    tractorId: l.tractorId ?? "",
    operadorId: l.operadorId ?? "",
    operadorHoras: l.operadorHoras ?? "",
    implementoId: l.implementoId ?? "",
    personas: l.personas.map((p) => ({ personalId: p.personalId, horas: p.horas })),
    combustibleProductoId: "",
    combustibleLitros: "",
    combustibleArchivo: null,
  }));
}

/** Validación de espejo del backend (9.4) — evita un viaje al servidor solo para descubrir un error de forma. */
function validarLineasForm(lineas: LineaForm[], tipoRecursoActividad: TipoRecursoActividad): string | null {
  if (lineas.length === 0) return "Falta capturar al menos una línea de recurso.";
  for (const l of lineas) {
    if (tipoRecursoActividad !== "mixta" && l.tipo !== tipoRecursoActividad) {
      return `Esta actividad solo admite líneas de tipo "${ETIQUETAS_TIPO[tipoRecursoActividad]}".`;
    }
    const personasValidas = l.personas.filter((p) => p.personalId);
    if (l.tipo === "gente") {
      if (personasValidas.length === 0) return "Una línea de Gente necesita al menos una persona.";
    } else {
      if (!l.tractorId || !l.operadorId || !l.implementoId) return `Una línea de ${ETIQUETAS_TIPO[l.tipo]} necesita Tractor, Operador e Implemento.`;
      if (!l.operadorHoras || Number(l.operadorHoras) <= 0) return "Falta capturar las horas del operador de una línea.";
      if (l.tipo === "mixta" && personasValidas.length === 0) return "Una línea de Mixta necesita al menos una persona además del operador.";
      if (!l.combustibleProductoId || !l.combustibleLitros || !l.combustibleArchivo) {
        return "Falta el relleno de diésel de esta línea (producto, litros y foto).";
      }
    }
    for (const p of personasValidas) {
      if (!p.horas || Number(p.horas) <= 0) return "Falta capturar las horas de una persona.";
    }
  }
  return null;
}

async function lineasParaEnviar(form: LineaForm[]) {
  return Promise.all(
    form.map(async (l) => ({
      tipo: l.tipo,
      tractorId: l.tipo !== "gente" ? l.tractorId : undefined,
      operadorId: l.tipo !== "gente" ? l.operadorId : undefined,
      operadorHoras: l.tipo !== "gente" ? Number(l.operadorHoras) : undefined,
      implementoId: l.tipo !== "gente" ? l.implementoId : undefined,
      personas: l.personas.filter((p) => p.personalId).map((p) => ({ personalId: p.personalId, horas: Number(p.horas) })),
      combustibleProductoId: l.tipo !== "gente" ? l.combustibleProductoId : undefined,
      combustibleLitros: l.tipo !== "gente" ? Number(l.combustibleLitros) : undefined,
      combustibleFotoUrl: l.tipo !== "gente" && l.combustibleArchivo ? await subirEvidencia(l.combustibleArchivo) : undefined,
    }))
  );
}

export default function Actividades() {
  const { usuario } = useAuth();
  const { huertas } = useHuertas();
  const { personal } = usePersonal();
  const { equipos: tractores } = useEquipos("tractor");
  const { equipos: implementos } = useEquipos("implemento");
  const { productos: productosCombustible } = useProductos(true, "Combustible");

  const [programadas, setProgramadas] = useState<ActividadProgramada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Programar ----
  const [mostrarForm, setMostrarForm] = useState(false);
  const [catalogo, setCatalogo] = useState<Actividad[]>([]);
  const [huertaId, setHuertaId] = useState("");
  const [cuadrosHuerta, setCuadrosHuerta] = useState<Cuadro[]>([]);
  const [cuadroIds, setCuadroIds] = useState<string[]>([]);
  const [actividadId, setActividadId] = useState("");
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState(hoyISO());

  // ---- Registrar avance ----
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [fechaReal, setFechaReal] = useState(hoyISO());
  const [avanceHectareas, setAvanceHectareas] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia("gente")]);
  const [comentario, setComentario] = useState("");

  // ---- Editar reporte existente ----
  const [editando, setEditando] = useState<string | null>(null);
  const [editAvanceHectareas, setEditAvanceHectareas] = useState("");
  const [editLineas, setEditLineas] = useState<LineaForm[]>([]);
  const [editComentario, setEditComentario] = useState("");

  function cargar() {
    setCargando(true);
    api
      .get<ActividadProgramada[]>("/actividades")
      .then(setProgramadas)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  useEffect(() => {
    api.get<Actividad[]>("/actividades/catalogo").then(setCatalogo);
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

  // Atajo "toda la Huerta" (16-ago-2026): equivale exactamente a marcar cada
  // Cuadro a mano uno por uno — mismo cuadroIds que llega al backend, sin
  // tocar ninguna lógica de negocio (candados de superficie, hectáreas
  // restantes, etc. siguen calculándose igual).
  function alternarTodaLaHuerta() {
    setCuadroIds((prev) => (prev.length === cuadrosHuerta.length ? [] : cuadrosHuerta.map((c) => c.id)));
  }

  // V1 P2 (25-sep-2026, Bloque 3): esta pantalla todavía programa por
  // Cuadro a su superficie completa (modo Por Variedad no tiene UI todavía).
  async function programar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cuadros = cuadroIds.map((cuadroId) => {
      const cuadro = cuadrosHuerta.find((c) => c.id === cuadroId);
      const vigente = cuadro?.versiones.find((v) => v.vigenteHasta == null) ?? cuadro?.versiones[0];
      return { cuadroId, hectareas: Number(vigente?.hectareas ?? 0) };
    });
    try {
      await api.post("/actividades", { huertaId, modo: "por_cuadro", cuadros, actividadId, fechaInicio, fechaFin });
      setMostrarForm(false);
      setCuadroIds([]);
      setActividadId("");
      setFechaInicio(hoyISO());
      setFechaFin(hoyISO());
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo programar la actividad.");
    }
  }

  // Precarga (9.4, 10-ago-2026, ampliada 15-ago-2026 con líneas de
  // tractor/mixta): el reporte de un nuevo día se pre-llena con las mismas
  // líneas del reporte anterior de esta misma Actividad — el
  // Supervisor/Capturista solo ajusta lo que cambió, sin afectar el
  // registro de días anteriores.
  function abrirRegistrar(a: ActividadProgramada) {
    setRegistrando(a.id);
    setFechaReal(hoyISO());
    setAvanceHectareas("");
    setComentario("");
    const ultimo = a.realizadas[0];
    setLineas(ultimo ? lineasDesdeExistentes(ultimo.lineas) : [lineaVacia(a.actividad.tipoRecurso === "mixta" ? "gente" : a.actividad.tipoRecurso)]);
  }

  async function confirmarRegistrar(a: ActividadProgramada) {
    setError(null);
    if (!avanceHectareas || Number(avanceHectareas) <= 0) {
      setError("Captura las hectáreas avanzadas en este reporte.");
      return;
    }
    const errorLineas = validarLineasForm(lineas, a.actividad.tipoRecurso);
    if (errorLineas) {
      setError(errorLineas);
      return;
    }

    try {
      await api.post(`/actividades/${a.id}/avance`, {
        fechaReal,
        hectareas: Number(avanceHectareas),
        lineas: await lineasParaEnviar(lineas),
        comentario: comentario.trim() || undefined,
      });
      setRegistrando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    }
  }

  function abrirEditar(r: ActividadProgramada["realizadas"][number]) {
    setEditando(r.id);
    setEditAvanceHectareas(r.hectareas);
    setEditLineas(lineasDesdeExistentes(r.lineas));
    setEditComentario(r.comentario ?? "");
  }

  async function confirmarEditar(a: ActividadProgramada, realizadaId: string) {
    setError(null);
    if (!editAvanceHectareas || Number(editAvanceHectareas) <= 0) {
      setError("Captura las hectáreas avanzadas en este reporte.");
      return;
    }
    const errorLineas = validarLineasForm(editLineas, a.actividad.tipoRecurso);
    if (errorLineas) {
      setError(errorLineas);
      return;
    }
    try {
      await api.patch(`/actividades/avance/${realizadaId}`, {
        hectareas: Number(editAvanceHectareas),
        lineas: await lineasParaEnviar(editLineas),
        comentario: editComentario.trim() || undefined,
      });
      setEditando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la edición.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Programar actividad"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={programar} className="card" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="field">
              Huerta
              <select value={huertaId} onChange={(e) => { setHuertaId(e.target.value); setCuadroIds([]); }} required>
                <option value="">Selecciona…</option>
                {huertas.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Actividad
              <select value={actividadId} onChange={(e) => setActividadId(e.target.value)} required>
                <option value="">Selecciona…</option>
                {catalogo.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
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
              Fecha inicio
              <FechaInput value={fechaInicio} onChange={setFechaInicio} required />
            </label>
            <label className="field">
              Fecha fin
              <FechaInput value={fechaFin} onChange={setFechaFin} required />
            </label>
            <button className="btn-primary" type="submit">
              Programar
            </button>
          </div>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {programadas.map((a) => (
            <div key={a.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {a.huerta.nombre} — {a.actividad.nombre} <span className="tag tag-neutral">{ETIQUETAS_TIPO[a.actividad.tipoRecurso]}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    Cuadros: {a.cuadros.map((c) => c.cuadro.nombre).join(", ") || "—"} · {formatearNumero(a.hectareasTotalesProgramadas)} ha ·{" "}
                    {formatearFecha(a.fechaInicio)} a {formatearFecha(a.fechaFin)}
                  </div>
                  {a.realizadas.length > 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                      {(a.porcentajeAvance ?? 0).toFixed(1)}% avance · {a.horasHombreTotales ?? 0} horas-hombre totales ·{" "}
                      {formaDinero(a.costoTotal ?? 0)} costo total · {a.realizadas.length} reporte{a.realizadas.length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {registrando !== a.id && (
                    <button className="btn-primary" onClick={() => abrirRegistrar(a)}>
                      Registrar avance
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
                    <input type="number" min={0} step="0.0001" value={avanceHectareas} onChange={(e) => setAvanceHectareas(e.target.value)} />
                  </label>
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 10 }}>
                    El sistema reparte automáticamente entre los Cuadros/Variedades, en proporción a lo programado.
                  </div>

                  <LineasActividadEditor
                    lineas={lineas}
                    setLineas={setLineas}
                    tipoRecursoActividad={a.actividad.tipoRecurso}
                    tractores={tractores}
                    implementos={implementos}
                    productosCombustible={productosCombustible}
                    personal={personal}
                  />

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
                        <th>Cuadros avanzados</th>
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
                              {/* 4.3 (20-ago-2026): antes era un solo string largo unido con
                                  "," y "·" — en la columna angosta de la tabla, los nombres se
                                  partían en varias líneas sin ningún corte visual claro entre
                                  una persona y otra. Una fila por línea, con las personas en
                                  una lista propia, se lee de un vistazo aunque la columna sea
                                  angosta. */}
                              {r.lineas.length === 0 ? (
                                "—"
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {r.lineas.map((l, i) => (
                                    <div key={i}>
                                      <div style={{ fontWeight: 600, fontSize: 11 }}>{ETIQUETAS_TIPO[l.tipo]}</div>
                                      <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
                                        {l.tipo !== "gente" && (
                                          <li>{l.operador ? `${l.operador.nombreCompleto} (${l.operadorHoras}h)` : "—"}</li>
                                        )}
                                        {l.personas.map((p) => (
                                          <li key={p.personal.id}>
                                            {p.personal.nombreCompleto} ({p.horas}h)
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td>
                              {formatearNumero(r.hectareas)} ha —{" "}
                              {r.cuadros.map((c) => `${c.cuadro.nombre}${c.variedad ? ` (${c.variedad})` : ""}: ${formatearNumero(c.hectareasAtribuidas)} ha`).join(", ") || "—"}
                            </td>
                            <td>{r.comentario || "—"}</td>
                            <td>
                              {editando !== r.id && (
                                <button className="btn-secondary" onClick={() => abrirEditar(r)}>
                                  Editar
                                </button>
                              )}
                            </td>
                          </tr>
                          {editando === r.id && (
                            <tr>
                              <td colSpan={5}>
                                <label className="field" style={{ maxWidth: 220, marginBottom: 8 }}>
                                  Hectáreas avanzadas
                                  <input type="number" min={0} step="0.0001" value={editAvanceHectareas} onChange={(e) => setEditAvanceHectareas(e.target.value)} />
                                </label>

                                <LineasActividadEditor
                                  lineas={editLineas}
                                  setLineas={setEditLineas}
                                  tipoRecursoActividad={a.actividad.tipoRecurso}
                                  tractores={tractores}
                                  implementos={implementos}
                                  productosCombustible={productosCombustible}
                                  personal={personal}
                                />

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
          {programadas.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay actividades programadas{usuario?.huertaId ? " en tu Huerta" : ""}.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Recurso real usado por reporte (9.4, 15-ago-2026): una o varias líneas.
 * El tipo de recurso de la Actividad restringe qué modalidades se ofrecen —
 * "gente"/"tractor" solo permiten su propio tipo, "mixta" permite combinar
 * cualquiera (mismo criterio de "no forzar los 3 siempre" del bloque 9.4).
 * A diferencia de Aplicaciones, las horas son por persona (y por operador),
 * no compartidas por línea.
 */
function LineasActividadEditor({
  lineas,
  setLineas,
  tipoRecursoActividad,
  tractores,
  implementos,
  productosCombustible,
  personal,
}: {
  lineas: LineaForm[];
  setLineas: (updater: (prev: LineaForm[]) => LineaForm[]) => void;
  tipoRecursoActividad: TipoRecursoActividad;
  tractores: { id: string; folio: string; marca: string | null; operadorDesignadoId: string | null }[];
  implementos: { id: string; folio: string; marca: string | null }[];
  productosCombustible: { id: string; nombreComercial: string }[];
  personal: { id: string; nombreCompleto: string }[];
}) {
  const tiposDisponibles: TipoRecursoActividad[] = tipoRecursoActividad === "mixta" ? ["gente", "tractor", "mixta"] : [tipoRecursoActividad];

  // Selector múltiple de personas (16-ago-2026, reemplaza "+ Otra persona"
  // de una en una): se abre para una sola línea a la vez, acumula la
  // selección en un checklist y las agrega todas juntas al confirmar —
  // como ya excluye del checklist a quien ya está en la línea, no hay forma
  // de volver a marcar a la misma persona dos veces (bug de duplicados).
  const [selectorAbiertoKey, setSelectorAbiertoKey] = useState<string | null>(null);
  const [seleccionPendiente, setSeleccionPendiente] = useState<Set<string>>(new Set());

  function actualizar(key: string, cambios: Partial<LineaForm>) {
    setLineas((prev) => prev.map((l) => (l.key !== key ? l : { ...l, ...cambios })));
  }

  function actualizarPersona(key: string, index: number, cambios: Partial<PersonaLineaForm>) {
    setLineas((prev) =>
      prev.map((l) => (l.key !== key ? l : { ...l, personas: l.personas.map((p, i) => (i !== index ? p : { ...p, ...cambios })) }))
    );
  }

  function abrirSelector(key: string) {
    setSelectorAbiertoKey(key);
    setSeleccionPendiente(new Set());
  }

  function cerrarSelector() {
    setSelectorAbiertoKey(null);
    setSeleccionPendiente(new Set());
  }

  function alternarSeleccion(personalId: string) {
    setSeleccionPendiente((prev) => {
      const copia = new Set(prev);
      if (copia.has(personalId)) copia.delete(personalId);
      else copia.add(personalId);
      return copia;
    });
  }

  function confirmarSeleccion(key: string) {
    if (seleccionPendiente.size === 0) return;
    setLineas((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        // La línea arranca con una fila vacía por defecto (sin persona
        // elegida todavía) — si sigue vacía cuando se agrega por checklist,
        // se descarta en vez de dejar una fila incompleta suelta.
        const yaConDatos = l.personas.filter((p) => p.personalId);
        const nuevas = [...seleccionPendiente].map((personalId) => ({ personalId, horas: "" }));
        return { ...l, personas: [...yaConDatos, ...nuevas] };
      })
    );
    cerrarSelector();
  }

  function quitarPersona(key: string, index: number) {
    setLineas((prev) => prev.map((l) => (l.key !== key ? l : { ...l, personas: l.personas.filter((_, i) => i !== index) })));
  }

  function elegirTractor(key: string, tractorId: string) {
    // Precarga del operador designado (9.13, 15-ago-2026) — solo sugiere,
    // editable libremente sin afectar el default guardado en la ficha.
    const designado = tractores.find((t) => t.id === tractorId)?.operadorDesignadoId ?? "";
    actualizar(key, { tractorId, operadorId: designado });
  }

  function agregarLinea() {
    setLineas((prev) => [...prev, lineaVacia(tiposDisponibles[0]!)]);
  }

  function quitarLinea(key: string) {
    setLineas((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 8 }}>
        Recurso real usado — una línea por tipo, se pueden combinar varias en el mismo reporte.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {lineas.map((l) => (
          <div key={l.key} className="card" style={{ background: "var(--surface-soft, #fafafa)" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
              {tiposDisponibles.length > 1 && (
                <label className="field">
                  Tipo
                  <select value={l.tipo} onChange={(e) => actualizar(l.key, { tipo: e.target.value as TipoRecursoActividad })}>
                    {tiposDisponibles.map((t) => (
                      <option key={t} value={t}>
                        {ETIQUETAS_TIPO[t]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {lineas.length > 1 && (
                <button className="btn-secondary" onClick={() => quitarLinea(l.key)}>
                  Quitar línea
                </button>
              )}
            </div>

            {l.tipo !== "gente" && (
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
                  Horas del operador
                  <input
                    type="number"
                    step="0.25"
                    style={{ width: 90 }}
                    value={l.operadorHoras}
                    onChange={(e) => actualizar(l.key, { operadorHoras: e.target.value })}
                  />
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

            {l.tipo !== "gente" && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <label className="field">
                  Diésel — producto
                  <select value={l.combustibleProductoId} onChange={(e) => actualizar(l.key, { combustibleProductoId: e.target.value })}>
                    <option value="">Selecciona…</option>
                    {productosCombustible.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombreComercial}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Litros del relleno
                  <input
                    type="number"
                    step="0.01"
                    style={{ width: 100 }}
                    value={l.combustibleLitros}
                    onChange={(e) => actualizar(l.key, { combustibleLitros: e.target.value })}
                  />
                </label>
                <label className="field">
                  Foto del relleno
                  <input type="file" accept="image/*" onChange={(e) => actualizar(l.key, { combustibleArchivo: e.target.files?.[0] ?? null })} />
                </label>
              </div>
            )}

            <div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>
                {l.tipo === "gente" ? "Personas de esta línea" : "Personas detrás del tractor (aparte del operador)"}
              </div>
              {l.personas.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>Sin personas todavía.</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {l.personas.map((p, i) => (
                  <div key={p.personalId} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div className="field" style={{ minWidth: 160, fontSize: 12.5, paddingTop: 4 }}>
                      {personal.find((per) => per.id === p.personalId)?.nombreCompleto ?? "—"}
                    </div>
                    <label className="field">
                      Horas
                      <input
                        type="number"
                        step="0.25"
                        style={{ width: 90 }}
                        value={p.horas}
                        onChange={(e) => actualizarPersona(l.key, i, { horas: e.target.value })}
                      />
                    </label>
                    <button className="btn-secondary" onClick={() => quitarPersona(l.key, i)}>
                      Quitar
                    </button>
                  </div>
                ))}
              </div>

              {selectorAbiertoKey === l.key ? (
                <div className="card" style={{ marginTop: 8, background: "var(--surface)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Marca a quiénes agregar</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
                    {personal
                      .filter((per) => !l.personas.some((p) => p.personalId === per.id))
                      .map((per) => (
                        <label key={per.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                          <input type="checkbox" checked={seleccionPendiente.has(per.id)} onChange={() => alternarSeleccion(per.id)} />
                          {per.nombreCompleto}
                        </label>
                      ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" disabled={seleccionPendiente.size === 0} onClick={() => confirmarSeleccion(l.key)}>
                      Agregar seleccionadas ({seleccionPendiente.size})
                    </button>
                    <button className="btn-secondary" onClick={cerrarSelector}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn-secondary" style={{ marginTop: 6 }} onClick={() => abrirSelector(l.key)}>
                  + Agregar personas
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button className="btn-secondary" style={{ marginTop: 8 }} onClick={agregarLinea}>
        + Otra línea
      </button>
    </div>
  );
}
