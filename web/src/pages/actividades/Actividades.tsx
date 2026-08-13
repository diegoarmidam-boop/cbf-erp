import { Fragment, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useHuertas } from "../../lib/useHuertas";
import { usePersonal } from "../../lib/usePersonal";
import type { Actividad, ActividadProgramada, ActividadRealizadaPersona, Cuadro } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";

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

interface PersonaForm {
  personalId: string;
  horas: string;
}

function personasDesdeExistentes(personas: ActividadRealizadaPersona[]): PersonaForm[] {
  return personas.map((p) => ({ personalId: p.personalId, horas: p.horas }));
}

/** Validación de espejo del backend (9.4) — evita un viaje al servidor solo para descubrir un error de forma. */
function validarPersonasForm(personas: PersonaForm[]): string | null {
  if (personas.length === 0) return "Falta capturar al menos una persona en este reporte.";
  for (const p of personas) {
    if (!p.personalId) return "Falta elegir la persona de una fila.";
    if (!p.horas || Number(p.horas) <= 0) return "Falta capturar las horas de una persona.";
  }
  return null;
}

export default function Actividades() {
  const { usuario } = useAuth();
  const { huertas } = useHuertas();
  const { personal } = usePersonal();

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
  const [personas, setPersonas] = useState<PersonaForm[]>([{ personalId: "", horas: "" }]);

  // ---- Editar reporte existente ----
  const [editando, setEditando] = useState<string | null>(null);
  const [editAvanceCuadros, setEditAvanceCuadros] = useState<Record<string, string>>({});
  const [editPersonas, setEditPersonas] = useState<PersonaForm[]>([]);

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

  // Precarga (9.4, 10-ago-2026): el reporte de un nuevo día se pre-llena con
  // las mismas personas y horas del reporte anterior de esta misma
  // Actividad — el Supervisor/Capturista solo ajusta lo que cambió, sin
  // afectar el registro de días anteriores.
  function abrirRegistrar(a: ActividadProgramada) {
    setRegistrando(a.id);
    setFechaReal(hoyISO());
    setAvanceCuadros({});
    const ultimo = a.realizadas[0];
    setPersonas(ultimo ? personasDesdeExistentes(ultimo.personas) : [{ personalId: "", horas: "" }]);
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

  function personasParaEnviar(form: PersonaForm[]) {
    return form.map((p) => ({ personalId: p.personalId, horas: Number(p.horas) }));
  }

  async function confirmarRegistrar(a: ActividadProgramada) {
    setError(null);
    const cuadros = cuadrosDesdeMapa(avanceCuadros, a.restantesPorCuadro);
    if (cuadros.length === 0) {
      setError("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");
      return;
    }
    const errorPersonas = validarPersonasForm(personas);
    if (errorPersonas) {
      setError(errorPersonas);
      return;
    }
    const resumen = resumenConfirmacion(a, avanceCuadros);
    if (resumen && !confirm(resumen)) return;

    try {
      await api.post(`/actividades/${a.id}/avance`, { fechaReal, cuadros, personas: personasParaEnviar(personas) });
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
    setEditPersonas(personasDesdeExistentes(r.personas));
  }

  async function confirmarEditar(a: ActividadProgramada, realizadaId: string) {
    setError(null);
    const cuadros = cuadrosDesdeMapa(editAvanceCuadros, a.restantesPorCuadro);
    if (cuadros.length === 0) {
      setError("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");
      return;
    }
    const errorPersonas = validarPersonasForm(editPersonas);
    if (errorPersonas) {
      setError(errorPersonas);
      return;
    }
    try {
      await api.patch(`/actividades/avance/${realizadaId}`, { cuadros, personas: personasParaEnviar(editPersonas) });
      setEditando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la edición.");
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Actividades</h2>

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
                    {a.huerta.nombre} — {a.actividad.nombre}
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

                  <PersonasEditor personas={personas} setPersonas={setPersonas} personal={personal} />

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
                        <th>Personas</th>
                        <th>Cuadros avanzados</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.realizadas.map((r) => (
                        <Fragment key={r.id}>
                          <tr>
                            <td>{formatearFecha(r.fechaReal)}</td>
                            <td>{r.personas.map((p) => `${p.personal.nombreCompleto} (${p.horas}h)`).join(", ") || "—"}</td>
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

                                <PersonasEditor personas={editPersonas} setPersonas={setEditPersonas} personal={personal} />

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

/** Precarga de personas (10-ago-2026, 9.4): lista de personas del reporte, cada una con sus propias horas. */
function PersonasEditor({
  personas,
  setPersonas,
  personal,
}: {
  personas: PersonaForm[];
  setPersonas: (updater: (prev: PersonaForm[]) => PersonaForm[]) => void;
  personal: { id: string; nombreCompleto: string }[];
}) {
  function actualizar(index: number, cambios: Partial<PersonaForm>) {
    setPersonas((prev) => prev.map((p, i) => (i !== index ? p : { ...p, ...cambios })));
  }

  function agregarFila() {
    setPersonas((prev) => [...prev, { personalId: "", horas: "" }]);
  }

  function quitarFila(index: number) {
    setPersonas((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 8 }}>Personas que trabajaron en este reporte, y cuántas horas cada una.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {personas.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label className="field">
              Persona
              <select value={p.personalId} onChange={(e) => actualizar(i, { personalId: e.target.value })}>
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
              <input type="number" step="0.25" style={{ width: 90 }} value={p.horas} onChange={(e) => actualizar(i, { horas: e.target.value })} />
            </label>
            {personas.length > 1 && (
              <button className="btn-secondary" onClick={() => quitarFila(i)}>
                Quitar
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="btn-secondary" style={{ marginTop: 8 }} onClick={agregarFila}>
        + Otra persona
      </button>
    </div>
  );
}
