import { Fragment, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useHuertas } from "../../lib/useHuertas";
import { usePersonal } from "../../lib/usePersonal";
import type { SeccionRiego, SegundaCintillaProgramacion } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";
import { formatearNumero } from "../../lib/numero";

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface PersonaForm {
  personalId: string;
  horas: string;
}

export default function SegundaCintilla() {
  const { usuario } = useAuth();
  const { huertas } = useHuertas();
  const { personal } = usePersonal();

  const [programadas, setProgramadas] = useState<SegundaCintillaProgramacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Programar ----
  const [mostrarForm, setMostrarForm] = useState(false);
  const [huertaId, setHuertaId] = useState("");
  const [seccionesHuerta, setSeccionesHuerta] = useState<SeccionRiego[]>([]);
  const [seccionIds, setSeccionIds] = useState<string[]>([]);
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState(hoyISO());

  // ---- Registrar avance ----
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [avanceSeccionId, setAvanceSeccionId] = useState("");
  const [fechaReal, setFechaReal] = useState(hoyISO());
  const [avanceHectareas, setAvanceHectareas] = useState("");
  const [personas, setPersonas] = useState<PersonaForm[]>([]);
  const [comentario, setComentario] = useState("");

  // ---- Editar reporte ----
  const [editando, setEditando] = useState<string | null>(null);
  const [editHectareas, setEditHectareas] = useState("");
  const [editPersonas, setEditPersonas] = useState<PersonaForm[]>([]);
  const [editComentario, setEditComentario] = useState("");

  function cargar() {
    setCargando(true);
    api
      .get<SegundaCintillaProgramacion[]>("/riego/segunda-cintilla")
      .then(setProgramadas)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }
  useEffect(cargar, []);

  useEffect(() => {
    if (!huertaId) {
      setSeccionesHuerta([]);
      return;
    }
    api.get<SeccionRiego[]>(`/secciones-riego?huertaId=${huertaId}`).then(setSeccionesHuerta);
  }, [huertaId]);

  function alternarSeccion(id: string) {
    setSeccionIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function programar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/riego/segunda-cintilla", { huertaId, seccionIds, fechaInicio, fechaFin });
      setMostrarForm(false);
      setHuertaId("");
      setSeccionIds([]);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo programar.");
    }
  }

  function abrirRegistrar(p: SegundaCintillaProgramacion) {
    setRegistrando(p.id);
    setAvanceSeccionId(p.secciones[0]?.seccionId ?? "");
    setFechaReal(hoyISO());
    setAvanceHectareas("");
    setPersonas([{ personalId: "", horas: "" }]);
    setComentario("");
  }

  function actualizarPersona(lista: PersonaForm[], set: (v: PersonaForm[]) => void, index: number, cambios: Partial<PersonaForm>) {
    set(lista.map((p, i) => (i !== index ? p : { ...p, ...cambios })));
  }

  function personasParaEnviar(lista: PersonaForm[]) {
    return lista.filter((p) => p.personalId && p.horas).map((p) => ({ personalId: p.personalId, horas: Number(p.horas) }));
  }

  async function confirmarRegistrar(p: SegundaCintillaProgramacion) {
    setError(null);
    if (!avanceHectareas || Number(avanceHectareas) <= 0) {
      setError("Captura las hectáreas avanzadas en este reporte.");
      return;
    }
    const personasValidas = personasParaEnviar(personas);
    if (personasValidas.length === 0) {
      setError("Captura al menos una persona con sus horas.");
      return;
    }
    try {
      await api.post(`/riego/segunda-cintilla/${p.id}/avance`, {
        seccionId: avanceSeccionId,
        fechaReal,
        hectareas: Number(avanceHectareas),
        personas: personasValidas,
        comentario: comentario.trim() || undefined,
      });
      setRegistrando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    }
  }

  function abrirEditar(r: SegundaCintillaProgramacion["realizadas"][number]) {
    setEditando(r.id);
    setEditHectareas(r.hectareas);
    setEditPersonas(r.personas.map((p) => ({ personalId: p.personalId, horas: p.horas })));
    setEditComentario(r.comentario ?? "");
  }

  async function confirmarEditar(realizadaId: string) {
    setError(null);
    if (!editHectareas || Number(editHectareas) <= 0) {
      setError("Captura las hectáreas avanzadas en este reporte.");
      return;
    }
    const personasValidas = personasParaEnviar(editPersonas);
    if (personasValidas.length === 0) {
      setError("Captura al menos una persona con sus horas.");
      return;
    }
    try {
      await api.patch(`/riego/segunda-cintilla/avance/${realizadaId}`, {
        hectareas: Number(editHectareas),
        personas: personasValidas,
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
      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 14 }}>
        Se programa por Sección de Riego (no por Cuadro) — cuando una Sección llega al 100% de sus hectáreas, sus líneas de cintilla pasan
        a 2 automáticamente, con la fecha de ese reporte.
      </div>

      <button className="btn-primary" style={{ marginBottom: 14 }} onClick={() => (mostrarForm ? setMostrarForm(false) : setMostrarForm(true))}>
        {mostrarForm ? "Cancelar" : "+ Programar"}
      </button>

      {mostrarForm && (
        <form onSubmit={programar} className="card" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="field">
              Huerta
              <select value={huertaId} onChange={(e) => { setHuertaId(e.target.value); setSeccionIds([]); }} required>
                <option value="">Selecciona…</option>
                {huertas.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Fecha inicio
              <FechaInput value={fechaInicio} onChange={setFechaInicio} required />
            </label>
            <label className="field">
              Fecha fin
              <FechaInput value={fechaFin} onChange={setFechaFin} required />
            </label>
          </div>

          {huertaId && (
            <div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 6 }}>Secciones de Riego</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {seccionesHuerta.map((s) => (
                  <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                    <input type="checkbox" checked={seccionIds.includes(s.id)} onChange={() => alternarSeccion(s.id)} />
                    {s.nombre}
                  </label>
                ))}
              </div>
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={seccionIds.length === 0}>
            Guardar programación
          </button>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {programadas.map((p) => (
            <div key={p.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.huerta.nombre}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    Secciones: {p.secciones.map((s) => s.seccion.nombre).join(", ")} · {formatearNumero(p.hectareasTotalesProgramadas ?? 0)} ha ·{" "}
                    {formatearFecha(p.fechaInicio)} a {formatearFecha(p.fechaFin)}
                  </div>
                  {p.realizadas.length > 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                      {(p.porcentajeAvance ?? 0).toFixed(1)}% avance · {p.realizadas.length} reporte{p.realizadas.length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {registrando !== p.id && (
                    <button className="btn-primary" onClick={() => abrirRegistrar(p)}>
                      Registrar avance
                    </button>
                  )}
                </div>
              </div>

              {registrando === p.id && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    <label className="field">
                      Sección
                      <select value={avanceSeccionId} onChange={(e) => setAvanceSeccionId(e.target.value)}>
                        {p.secciones.map((s) => {
                          const restan = p.restantesPorSeccion?.[s.seccionId];
                          return (
                            <option key={s.seccionId} value={s.seccionId}>
                              {s.seccion.nombre} {restan !== undefined ? `(quedan ${restan.toFixed(2)} ha)` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <label className="field">
                      Fecha
                      <FechaInput value={fechaReal} onChange={setFechaReal} />
                    </label>
                    <label className="field" style={{ maxWidth: 180 }}>
                      Hectáreas avanzadas
                      <input type="number" min={0} step="0.0001" value={avanceHectareas} onChange={(e) => setAvanceHectareas(e.target.value)} />
                    </label>
                  </div>

                  <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>Personas</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                    {personas.map((pf, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <label className="field">
                          Persona
                          <select value={pf.personalId} onChange={(e) => actualizarPersona(personas, setPersonas, i, { personalId: e.target.value })}>
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
                            value={pf.horas}
                            onChange={(e) => actualizarPersona(personas, setPersonas, i, { horas: e.target.value })}
                          />
                        </label>
                        {personas.length > 1 && (
                          <button className="btn-secondary" onClick={() => setPersonas(personas.filter((_, idx) => idx !== i))}>
                            Quitar
                          </button>
                        )}
                      </div>
                    ))}
                    <button className="btn-secondary" style={{ width: "fit-content" }} onClick={() => setPersonas([...personas, { personalId: "", horas: "" }])}>
                      + Agregar persona
                    </button>
                  </div>

                  <label className="field" style={{ marginBottom: 10 }}>
                    Comentario (opcional)
                    <textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} />
                  </label>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" onClick={() => confirmarRegistrar(p)}>
                      Guardar
                    </button>
                    <button className="btn-secondary" onClick={() => setRegistrando(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {p.realizadas.length > 0 && (
                <table style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Sección</th>
                      <th>Hectáreas</th>
                      <th>Personas</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.realizadas.map((r) => (
                      <Fragment key={r.id}>
                        <tr>
                          <td>{formatearFecha(r.fechaReal)}</td>
                          <td>{r.seccion.nombre}</td>
                          <td>{formatearNumero(r.hectareas)} ha</td>
                          <td>{r.personas.map((per) => `${per.personal.nombreCompleto} (${per.horas}h)`).join(", ")}</td>
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
                              <label className="field" style={{ maxWidth: 180, marginBottom: 8 }}>
                                Hectáreas avanzadas
                                <input type="number" min={0} step="0.0001" value={editHectareas} onChange={(e) => setEditHectareas(e.target.value)} />
                              </label>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                                {editPersonas.map((pf, i) => (
                                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                                    <label className="field">
                                      Persona
                                      <select
                                        value={pf.personalId}
                                        onChange={(e) => actualizarPersona(editPersonas, setEditPersonas, i, { personalId: e.target.value })}
                                      >
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
                                        value={pf.horas}
                                        onChange={(e) => actualizarPersona(editPersonas, setEditPersonas, i, { horas: e.target.value })}
                                      />
                                    </label>
                                    {editPersonas.length > 1 && (
                                      <button className="btn-secondary" onClick={() => setEditPersonas(editPersonas.filter((_, idx) => idx !== i))}>
                                        Quitar
                                      </button>
                                    )}
                                  </div>
                                ))}
                                <button
                                  className="btn-secondary"
                                  style={{ width: "fit-content" }}
                                  onClick={() => setEditPersonas([...editPersonas, { personalId: "", horas: "" }])}
                                >
                                  + Agregar persona
                                </button>
                              </div>
                              <label className="field" style={{ marginBottom: 8 }}>
                                Comentario (opcional)
                                <textarea rows={2} value={editComentario} onChange={(e) => setEditComentario(e.target.value)} />
                              </label>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button className="btn-primary" onClick={() => confirmarEditar(r.id)}>
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
              )}
            </div>
          ))}
          {programadas.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay programaciones{usuario?.huertaId ? " en tu Huerta" : ""}.</p>}
        </div>
      )}
    </div>
  );
}
