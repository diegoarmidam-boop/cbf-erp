import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { usePersonal } from "../../lib/usePersonal";
import { useHuertas } from "../../lib/useHuertas";
import { useEquipoSeleccionado } from "./EquipoSeleccionadoContext";
import type { EquipoUsoDiario } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function UsoDiario() {
  const { equipoId } = useEquipoSeleccionado();
  const { personal } = usePersonal();
  const { huertas } = useHuertas();
  const [registros, setRegistros] = useState<EquipoUsoDiario[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [fecha, setFecha] = useState(hoyISO());
  const [operadorId, setOperadorId] = useState("");
  const [horas, setHoras] = useState("");
  const [huertaId, setHuertaId] = useState("");

  function cargar() {
    if (!equipoId) return;
    api.get<EquipoUsoDiario[]>(`/equipos/uso-diario/${equipoId}`).then(setRegistros);
  }

  useEffect(cargar, [equipoId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/equipos/uso-diario/${equipoId}`, { fecha, operadorId, horas: Number(horas), huertaId });
      setHoras("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    }
  }

  if (!equipoId) return <p style={{ color: "var(--ink-soft)" }}>No hay equipos dados de alta todavía.</p>;

  return (
    <div>
      <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
        <label className="field">
          Fecha
          <FechaInput value={fecha} onChange={setFecha} required />
        </label>
        <label className="field">
          Operador
          <select value={operadorId} onChange={(e) => setOperadorId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombreCompleto}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Horas
          <input type="number" step="0.1" value={horas} onChange={(e) => setHoras(e.target.value)} required />
        </label>
        <label className="field">
          Huerta
          <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {huertas.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primary" type="submit">
          Registrar
        </button>
      </form>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Operador</th>
            <th>Horas</th>
            <th>Huerta</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.id}>
              <td>{formatearFecha(r.fecha)}</td>
              <td>{r.operador.nombreCompleto}</td>
              <td>{r.horas}</td>
              <td>{r.huerta.nombre}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
