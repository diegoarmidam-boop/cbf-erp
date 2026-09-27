import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import type { DiaAsistencia } from "../../lib/types";
import { colorDia } from "./Asistencia";

interface FilaMatriz {
  personalId: string;
  nombreCompleto: string;
  dias: DiaAsistencia[];
}

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

/**
 * Matriz de Asistencia (V1 P6, 27-sep-2026, 9.11f): todas las personas × días
 * en una sola vista, mismos colores que la tira de calendario por persona
 * (que sigue existiendo aparte, sin cambios) — se alimenta de la captura
 * diaria y de Ajustes de Asistencia (Bono de Asistencia), sin tocar ni un
 * cálculo de ese módulo.
 */
export default function MatrizAsistencia() {
  const { huertas } = useHuertas();
  const [huertaId, setHuertaId] = useState("");
  const [semanaRef, setSemanaRef] = useState(new Date().toISOString().slice(0, 10));
  const [filas, setFilas] = useState<FilaMatriz[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const semana = semanaCalendarioLS(semanaRef);

  function cargar() {
    setCargando(true);
    const query = new URLSearchParams({ fechaIni: semana.inicio, fechaFin: semana.fin });
    if (huertaId) query.set("huertaId", huertaId);
    api
      .get<FilaMatriz[]>(`/nomina/asistencia/matriz?${query.toString()}`)
      .then(setFilas)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }
  useEffect(cargar, [huertaId, semana.inicio, semana.fin]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <label className="field" style={{ maxWidth: 220 }}>
          Huerta
          <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)}>
            <option value="">Todas</option>
            {huertas.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ maxWidth: 200 }}>
          Semana de
          <input type="date" value={semanaRef} onChange={(e) => setSemanaRef(e.target.value)} />
        </label>
      </div>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Persona</th>
              {NOMBRES_CORTOS.map((n, i) => (
                <th key={i} style={{ textAlign: "center" }}>
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.personalId}>
                <td>{f.nombreCompleto}</td>
                {f.dias.map((d) => (
                  <td key={d.fecha} style={{ textAlign: "center" }}>
                    <div
                      style={{ width: 20, height: 20, borderRadius: "50%", background: colorDia(d.estado), margin: "0 auto" }}
                      title={`${d.fecha}: ${d.estado}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                  No hay personal activo para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 10 }}>
        🟢 Cumplió · 🔴 Falta injustificada · 🟠 Falta justificada · ⚪ Sin registro todavía
      </p>
    </div>
  );
}
