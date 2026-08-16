import { Fragment, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useHuertas } from "../../lib/useHuertas";
import { usePersonal } from "../../lib/usePersonal";
import { useEquipos } from "../../lib/useEquipos";
import type { Actividad, ActividadProgramada, ActividadRealizadaLinea, Cuadro, TipoRecursoActividad } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";

const ETIQUETAS_TIPO: Record<TipoRecursoActividad, string> = {
  gente: "Gente",
  tractor: "Tractor",
  mixta: "Mixta",
};

function hoyISO(): string {
  const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formaEntero(valor: string | number): string {
  const n = Number(valor);
  return Number.isFinite(n) ? n.toLocaleString("es-MX", { maximumFractionDigits: 3 }) : String(valor);
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
}

function lineaVacia(tipoDefault: TipoRecursoActividad): LineaForm {
  return { key: nuevaKey(), tipo: tipoDefault, tractorId: "", operadorId: "", operadorHoras: "", implementoId: "", personas: [{ personalId: "", horas: "" }] };
}

function lineasDesdeExistentes(lineas: ActividadRealizadaLinea[]): LineaForm[] {
  return lineas.map((l) => ({
    key: nuevaKey(),
    tipo: l.tipo,
    tractorId: l.tractorId ?? "",
    operadorId: l.operadorId ?? "",
    operadorHoras: l.operadorHoras ?? "",
    implementoId: l.implementoId ?? "",
    personas: l.personas.length > 0 ? l.personas.map((p) => ({ personalId: p.personalId, horas: p.horas })) : [{ personalId: "", horas: "" }],
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
    }
    for (const p of personasValidas) {
      if (!p.horas || Number(p.horas) <= 0) return "Falta capturar las horas de una persona.";
    }
  }
  return null;
}

function lineasParaEnviar(form: LineaForm[]) {
  return form.map((l) => ({
    tipo: l.tipo,
    tractorId: l.tipo !== "gente" ? l.tractorId : undefined,
    operadorId: l.tipo !== "gente" ? l.operadorId : undefined,
    operadorHoras: l.tipo !== "gente" ? Number(l.operadorHoras) : undefined,
    implementoId: l.tipo !== "gente" ? l.implementoId : undefined,
    personas: l.personas.filter((p) => p.personalId).map((p) => ({ personalId: p.personalId, horas: Number(p.horas) })),
  }));
}

export default function Actividades() {
  const { usuario } = useAuth();
  const { huertas } = useHuertas();
  const { personal } = usePersonal();
  const { equipos: tractores } = useEquipos("tractor");
  const { equipos: implementos } = useEquipos("implemento");

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
  const [avanceCuadros, setAvanceCuadros] = useState<Record<string, string>>({});
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia("gente")]);

  // ---- Editar reporte existente ----
  const [editando, setEditando] = useState<string | null>(null);
  const [editAvanceCuadros, setEditAvanceCuadros] = useState<Record<string, string>>({});
  const [editLineas, setEditLineas] = useState<LineaForm[]>([]);

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

  async function programar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/actividades", { huertaId, cuadroIds, actividadId, fechaInicio, fechaFin });
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
    setAvanceCuadros({});
    const ultimo = a.realizadas[0];
    setLineas(ultimo ? lineasDesdeExistentes(ultimo.lineas) : [lineaVacia(a.actividad.tipoRecurso === "mixta" ? "gente" : a.actividad.tipoRecurso)]);
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

  function resumenConfirmacion(a: ActividadProgramada, mapa: Record<string, string>): string {
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

  async function confirmarRegistrar(a: ActividadProgramada) {
    setError(null);
    const cuadros = cuadrosDesdeMapa(avanceCuadros, a.restantesPorCuadro);
    if (cuadros.length === 0) {
      setError("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");
      return;
    }
    const errorLineas = validarLineasForm(lineas, a.actividad.tipoRecurso);
    if (errorLineas) {
      setError(errorLineas);
      return;
    }
    const resumen = resumenConfirmacion(a, avanceCuadros);
    if (resumen && !confirm(resumen)) return;

    try {
      await api.post(`/actividades/${a.id}/avance`, { fechaReal, cuadros, lineas: lineasParaEnviar(lineas) });
      setRegistrando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    }
  }

  function abrirEditar(r: ActividadProgramada["realizadas"][number]) {
    setEditando(r.id);
    const mapa: Record<string, string> = {};
    for (const c of r.cuadros) mapa[c.cuadroId] = c.hectareas;
    setEditAvanceCuadros(mapa);
    setEditLineas(lineasDesdeExistentes(r.lineas));
  }

  async function confirmarEditar(a: ActividadProgramada, realizadaId: string) {
    setError(null);
    const cuadros = cuadrosDesdeMapa(editAvanceCuadros, a.restantesPorCuadro);
    if (cuadros.length === 0) {
      setError("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");
      return;
    }
    const errorLineas = validarLineasForm(editLineas, a.actividad.tipoRecurso);
    if (errorLineas) {
      setError(errorLineas);
      return;
    }
    try {
      await api.patch(`/actividades/avance/${realizadaId}`, { cuadros, lineas: lineasParaEnviar(editLineas) });
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
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
                    Cuadros: {a.cuadros.map((c) => c.cuadro.nombre).join(", ") || "—"} · {formaEntero(a.hectareasTotalesProgramadas)} ha ·{" "}
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

                  <LineasActividadEditor
                    lineas={lineas}
                    setLineas={setLineas}
                    tipoRecursoActividad={a.actividad.tipoRecurso}
                    tractores={tractores}
                    implementos={implementos}
                    personal={personal}
                  />

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
                                .map((l) => {
                                  const gente = l.personas.map((p) => `${p.personal.nombreCompleto} (${p.horas}h)`).join(", ");
                                  if (l.tipo === "gente") return `${ETIQUETAS_TIPO[l.tipo]}: ${gente || "—"}`;
                                  const op = l.operador ? `${l.operador.nombreCompleto} (${l.operadorHoras}h)` : "—";
                                  return `${ETIQUETAS_TIPO[l.tipo]}: ${op}${gente ? ` + ${gente}` : ""}`;
                                })
                                .join(" · ") || "—"}
                            </td>
                            <td>{r.cuadros.map((c) => `${c.cuadro.nombre} (${c.hectareas} ha)`).join(", ") || "—"}</td>
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

                                <LineasActividadEditor
                                  lineas={editLineas}
                                  setLineas={setEditLineas}
                                  tipoRecursoActividad={a.actividad.tipoRecurso}
                                  tractores={tractores}
                                  implementos={implementos}
                                  personal={personal}
                                />

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
  personal,
}: {
  lineas: LineaForm[];
  setLineas: (updater: (prev: LineaForm[]) => LineaForm[]) => void;
  tipoRecursoActividad: TipoRecursoActividad;
  tractores: { id: string; folio: string; marca: string | null; operadorDesignadoId: string | null }[];
  implementos: { id: string; folio: string; marca: string | null }[];
  personal: { id: string; nombreCompleto: string }[];
}) {
  const tiposDisponibles: TipoRecursoActividad[] = tipoRecursoActividad === "mixta" ? ["gente", "tractor", "mixta"] : [tipoRecursoActividad];

  function actualizar(key: string, cambios: Partial<LineaForm>) {
    setLineas((prev) => prev.map((l) => (l.key !== key ? l : { ...l, ...cambios })));
  }

  function actualizarPersona(key: string, index: number, cambios: Partial<PersonaLineaForm>) {
    setLineas((prev) =>
      prev.map((l) => (l.key !== key ? l : { ...l, personas: l.personas.map((p, i) => (i !== index ? p : { ...p, ...cambios })) }))
    );
  }

  function agregarPersona(key: string) {
    setLineas((prev) => prev.map((l) => (l.key !== key ? l : { ...l, personas: [...l.personas, { personalId: "", horas: "" }] })));
  }

  function quitarPersona(key: string, index: number) {
    setLineas((prev) =>
      prev.map((l) => (l.key !== key ? l : { ...l, personas: l.personas.length === 1 ? l.personas : l.personas.filter((_, i) => i !== index) }))
    );
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

            <div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>
                {l.tipo === "gente" ? "Personas de esta línea" : "Personas detrás del tractor (aparte del operador)"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {l.personas.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <label className="field">
                      Persona
                      <select value={p.personalId} onChange={(e) => actualizarPersona(l.key, i, { personalId: e.target.value })}>
                        <option value="">Selecciona…</option>
                        {personal.map((per) => (
                          <option key={per.id} value={per.id}>
                            {per.nombreCompleto}
                          </option>
                        ))}
                      </select>
                    </label>
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
                    {l.personas.length > 1 && (
                      <button className="btn-secondary" onClick={() => quitarPersona(l.key, i)}>
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button className="btn-secondary" style={{ marginTop: 6 }} onClick={() => agregarPersona(l.key)}>
                + Otra persona
              </button>
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
