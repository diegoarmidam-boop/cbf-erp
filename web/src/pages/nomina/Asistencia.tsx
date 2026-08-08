import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { usePersonal } from "../../lib/usePersonal";
import type { DiaAsistencia } from "../../lib/types";

function semanaCalendarioLS(fechaRef: string): { inicio: string; fin: string } {
  const d = new Date(fechaRef + "T12:00:00");
  const dow = d.getDay();
  const diffALunes = dow === 0 ? -6 : 1 - dow;
  const lunes = new Date(d);
  lunes.setDate(lunes.getDate() + diffALunes);
  const sabado = new Date(lunes);
  sabado.setDate(sabado.getDate() + 5);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { inicio: iso(lunes), fin: iso(sabado) };
}

const NOMBRES_CORTOS = ["L", "M", "M", "J", "V", "S"];

function colorDia(estado: DiaAsistencia["estado"]): string {
  if (estado === "cumplio") return "var(--success)";
  if (estado === "falta_injustificada") return "var(--danger)";
  return "var(--border)";
}

export default function Asistencia() {
  const { personal, cargando: cargandoPersonal } = usePersonal();
  const [personalId, setPersonalId] = useState("");
  const semana = semanaCalendarioLS(new Date().toISOString().slice(0, 10));
  const [dias, setDias] = useState<DiaAsistencia[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!personalId && personal.length > 0) setPersonalId(personal[0]!.id);
  }, [personal, personalId]);

  useEffect(() => {
    if (!personalId) return;
    setCargando(true);
    api
      .get<DiaAsistencia[]>(`/nomina/asistencia/${personalId}?fechaIni=${semana.inicio}&fechaFin=${semana.fin}`)
      .then(setDias)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }, [personalId]);

  if (cargandoPersonal) return <p>Cargando…</p>;

  return (
    <div>
      <label className="field" style={{ marginBottom: 16, maxWidth: 320 }}>
        Persona
        <select value={personalId} onChange={(e) => setPersonalId(e.target.value)}>
          {personal.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombreCompleto} ({p.tipo})
            </option>
          ))}
        </select>
      </label>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px" }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <div className="card" style={{ display: "flex", gap: 10 }}>
          {dias.map((d, i) => (
            <div key={d.fecha} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 6 }}>{NOMBRES_CORTOS[i]}</div>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: colorDia(d.estado),
                }}
                title={d.estado}
              />
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 10 }}>
        🟢 Cumplió · 🔴 Falta injustificada · ⚪ Sin registro todavía
      </p>
    </div>
  );
}
