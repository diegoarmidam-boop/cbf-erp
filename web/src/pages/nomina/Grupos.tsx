import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { usePersonal } from "../../lib/usePersonal";
import type { GrupoPago } from "../../lib/types";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Grupos() {
  const { personal } = usePersonal();
  const [grupos, setGrupos] = useState<GrupoPago[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombreGrupo, setNombreGrupo] = useState("");
  const [persistenteGrupo, setPersistenteGrupo] = useState(true);
  const [miembrosGrupo, setMiembrosGrupo] = useState<string[]>([]);
  const [agregarA, setAgregarA] = useState<Record<string, string>>({});

  function cargar() {
    api.get<GrupoPago[]>(`/nomina/grupos?fecha=${hoyISO()}`).then(setGrupos);
  }

  useEffect(cargar, []);

  function alternarMiembroNuevo(personalId: string) {
    setMiembrosGrupo((prev) => (prev.includes(personalId) ? prev.filter((p) => p !== personalId) : [...prev, personalId]));
  }

  async function crearGrupo(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/nomina/grupos", {
        nombre: nombreGrupo || undefined,
        persistente: persistenteGrupo,
        fecha: hoyISO(),
        miembros: miembrosGrupo,
      });
      setNombreGrupo("");
      setMiembrosGrupo([]);
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el grupo.");
    }
  }

  async function agregarMiembro(grupoId: string) {
    const personalId = agregarA[grupoId];
    if (!personalId) return;
    setError(null);
    try {
      await api.post(`/nomina/grupos/${grupoId}/miembros`, { personalId, fecha: hoyISO() });
      setAgregarA((prev) => ({ ...prev, [grupoId]: "" }));
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar.");
    }
  }

  async function quitarMiembro(grupoId: string, personalId: string) {
    setError(null);
    try {
      await api.delete(`/nomina/grupos/${grupoId}/miembros/${personalId}?fecha=${hoyISO()}`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo quitar.");
    }
  }

  async function borrarGrupo(grupoId: string) {
    if (!confirm("¿Borrar este grupo? Solo se puede si nunca se usó en una captura.")) return;
    setError(null);
    try {
      await api.delete(`/nomina/grupos/${grupoId}`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar.");
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
        Catálogo global — un grupo de pago no está ligado a ninguna Huerta, se puede usar en cualquier Rancho al capturar.
      </p>

      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Nuevo grupo"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={crearGrupo} className="card" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="field">
              Nombre (opcional — vacío si es armado del día, sin nombre fijo)
              <input value={nombreGrupo} onChange={(e) => setNombreGrupo(e.target.value)} placeholder="Corte G1" />
            </label>
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={persistenteGrupo} onChange={(e) => setPersistenteGrupo(e.target.checked)} />
              Persistente (se reutiliza semana a semana)
            </label>
          </div>
          <div className="field">
            Miembros iniciales
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxHeight: 160, overflowY: "auto", marginTop: 4 }}>
              {personal.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--ink)" }}>
                  <input type="checkbox" checked={miembrosGrupo.includes(p.id)} onChange={() => alternarMiembroNuevo(p.id)} />
                  {p.nombreCompleto}
                </label>
              ))}
            </div>
          </div>
          <div>
            <button className="btn-primary" type="submit" disabled={miembrosGrupo.length === 0}>
              Guardar
            </button>
          </div>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {grupos.map((g) => (
          <div key={g.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <span className="tag tag-neutral">{g.persistente ? "Persistente" : "Del día"}</span>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{g.nombre ?? "(sin nombre)"}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                  {(g.miembrosHoy ?? []).map((personalId) => {
                    const p = personal.find((x) => x.id === personalId);
                    return (
                      <span key={personalId} className="tag tag-neutral" style={{ marginRight: 4, marginBottom: 4, display: "inline-flex", gap: 4 }}>
                        {p?.nombreCompleto ?? personalId}
                        <button
                          onClick={() => quitarMiembro(g.id, personalId)}
                          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--danger)", fontWeight: 700, padding: 0 }}
                          title="Quitar del grupo"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                  {(g.miembrosHoy ?? []).length === 0 && <span>Sin miembros hoy.</span>}
                </div>
              </div>
              <button className="btn-secondary" onClick={() => borrarGrupo(g.id)}>
                Borrar grupo
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 10 }}>
              <select value={agregarA[g.id] ?? ""} onChange={(e) => setAgregarA((prev) => ({ ...prev, [g.id]: e.target.value }))}>
                <option value="">Agregar persona…</option>
                {personal
                  .filter((p) => !(g.miembrosHoy ?? []).includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombreCompleto}
                    </option>
                  ))}
              </select>
              <button className="btn-secondary" onClick={() => agregarMiembro(g.id)}>
                Agregar
              </button>
            </div>
          </div>
        ))}
        {grupos.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay grupos de pago todavía.</p>}
      </div>
    </div>
  );
}
