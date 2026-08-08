import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import { useActividades } from "../../lib/useActividades";
import { usePersonal } from "../../lib/usePersonal";
import type { CapturaDelDiaResponse, FilaCaptura, GrupoPago } from "../../lib/types";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function filaVacia(): FilaCaptura {
  return { tipo: "individual", actividadId: "", cantidad: null };
}

export default function CapturaDelDia() {
  const { huertas, cargando: cargandoHuertas } = useHuertas();
  const { actividades } = useActividades();
  const { personal } = usePersonal();

  const [huertaId, setHuertaId] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [filas, setFilas] = useState<FilaCaptura[]>([]);
  const [cerrado, setCerrado] = useState(false);
  const [grupos, setGrupos] = useState<GrupoPago[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    if (!huertaId && huertas.length > 0) setHuertaId(huertas[0]!.id);
  }, [huertas, huertaId]);

  useEffect(() => {
    if (!huertaId || !fecha) return;
    setCargando(true);
    setError(null);
    setMensaje(null);
    Promise.all([
      api.get<CapturaDelDiaResponse>(`/nomina/captura/${huertaId}/${fecha}`),
      api.get<GrupoPago[]>(`/nomina/grupos?huertaId=${huertaId}&fecha=${fecha}`),
    ])
      .then(([captura, gruposHuerta]) => {
        setCerrado(captura.cerrado);
        setGrupos(gruposHuerta);
        if (captura.registros.length > 0) {
          setFilas(captura.registros.map((r) => ({ ...r, cantidad: Number(r.cantidad) })));
        } else if (captura.sugerencia.length > 0) {
          setFilas(captura.sugerencia);
        } else {
          setFilas([]);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar la captura."))
      .finally(() => setCargando(false));
  }, [huertaId, fecha]);

  function actualizarFila(i: number, cambios: Partial<FilaCaptura>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...cambios } : f)));
  }

  function quitarFila(i: number) {
    setFilas((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      await api.post(`/nomina/captura/${huertaId}/${fecha}`, {
        filas: filas.map((f) => ({ ...f, cantidad: Number(f.cantidad) })),
      });
      setMensaje("Captura guardada.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la captura.");
    } finally {
      setGuardando(false);
    }
  }

  if (cargandoHuertas) return <p>Cargando…</p>;
  if (huertas.length === 0) {
    return <p style={{ color: "var(--ink-soft)" }}>No hay Huertas dadas de alta todavía — ve a Unidades de Producción.</p>;
  }

  const filasIncompletas = filas.some((f) => !f.actividadId || !f.cantidad || f.cantidad <= 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <label className="field">
          Huerta
          <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)}>
            {huertas.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </div>

      {cerrado && (
        <div className="tag tag-neutral" style={{ marginBottom: 12 }}>
          Este día ya está cerrado — no se puede editar.
        </div>
      )}
      {error && (
        <div className="tag tag-danger" style={{ marginBottom: 12, display: "block", padding: "8px 12px" }}>
          {error}
        </div>
      )}
      {mensaje && (
        <div className="tag tag-success" style={{ marginBottom: 12, display: "block", padding: "8px 12px" }}>
          {mensaje}
        </div>
      )}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Persona / Grupo</th>
                <th>Actividad</th>
                <th>Cantidad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => {
                const actividad = actividades.find((a) => a.id === fila.actividadId);
                return (
                  <tr key={i}>
                    <td>
                      <select
                        value={fila.tipo}
                        disabled={cerrado}
                        onChange={(e) => actualizarFila(i, { tipo: e.target.value as "individual" | "grupal", personalId: undefined, grupoId: undefined })}
                      >
                        <option value="individual">Individual</option>
                        <option value="grupal">Grupal</option>
                      </select>
                    </td>
                    <td>
                      {fila.tipo === "individual" ? (
                        <select value={fila.personalId ?? ""} disabled={cerrado} onChange={(e) => actualizarFila(i, { personalId: e.target.value })}>
                          <option value="">Selecciona…</option>
                          {personal.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombreCompleto}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select value={fila.grupoId ?? ""} disabled={cerrado} onChange={(e) => actualizarFila(i, { grupoId: e.target.value })}>
                          <option value="">Selecciona…</option>
                          {grupos.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.nombre ?? "Grupo sin nombre"} ({g.miembrosHoy?.length ?? 0})
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <select value={fila.actividadId} disabled={cerrado} onChange={(e) => actualizarFila(i, { actividadId: e.target.value })}>
                        <option value="">Selecciona…</option>
                        {actividades.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre} ({a.unidad})
                          </option>
                        ))}
                      </select>
                      {actividad?.requiereCuadro && (
                        <div style={{ fontSize: 10.5, color: "var(--warning)" }}>Requiere Cuadro — módulo aún no construido.</div>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        style={{ width: 90 }}
                        value={fila.cantidad ?? ""}
                        disabled={cerrado}
                        onChange={(e) => actualizarFila(i, { cantidad: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      {!cerrado && (
                        <button className="btn-secondary" onClick={() => quitarFila(i)}>
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!cerrado && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
              <button className="btn-secondary" onClick={() => setFilas((prev) => [...prev, filaVacia()])}>
                + Otra actividad
              </button>
              <button className="btn-primary" onClick={guardar} disabled={guardando || filas.length === 0 || filasIncompletas}>
                {guardando ? "Guardando…" : "Guardar captura del día"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
