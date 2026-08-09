import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { usePuestos } from "../../lib/usePuestos";

export default function Puestos() {
  const { puestos, cargando, refetch } = usePuestos();
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [nombre, setNombre] = useState("");
  const [periodicidad, setPeriodicidad] = useState<"semanal" | "quincenal" | "mensual">("semanal");
  const [metodoAsignacionCosto, setMetodoAsignacionCosto] = useState<"directo_huerta" | "prorrateo_hectareas">("directo_huerta");
  const [rangoMin, setRangoMin] = useState("");
  const [rangoMax, setRangoMax] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/rh/puestos", {
        nombre,
        periodicidad,
        metodoAsignacionCosto,
        rangoSalarialMin: rangoMin ? Number(rangoMin) : undefined,
        rangoSalarialMax: rangoMax ? Number(rangoMax) : undefined,
      });
      setNombre("");
      setRangoMin("");
      setRangoMax("");
      setMostrarForm(false);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Nuevo puesto"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
          <label className="field">
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label className="field">
            Periodicidad
            <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value as typeof periodicidad)}>
              <option value="semanal">Semanal</option>
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mensual</option>
            </select>
          </label>
          <label className="field">
            Asignación de costo
            <select value={metodoAsignacionCosto} onChange={(e) => setMetodoAsignacionCosto(e.target.value as typeof metodoAsignacionCosto)}>
              <option value="directo_huerta">Directo a Huerta</option>
              <option value="prorrateo_hectareas">Prorrateo por hectáreas</option>
            </select>
          </label>
          <label className="field">
            Rango salarial mín.
            <input type="number" step="0.01" value={rangoMin} onChange={(e) => setRangoMin(e.target.value)} />
          </label>
          <label className="field">
            Rango salarial máx.
            <input type="number" step="0.01" value={rangoMax} onChange={(e) => setRangoMax(e.target.value)} />
          </label>
          <button className="btn-primary" type="submit">
            Guardar
          </button>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Periodicidad</th>
              <th>Asignación de costo</th>
              <th>Rango salarial</th>
            </tr>
          </thead>
          <tbody>
            {puestos.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td>{p.periodicidad}</td>
                <td>{p.metodoAsignacionCosto}</td>
                <td>
                  {p.rangoSalarialMin ?? "—"} – {p.rangoSalarialMax ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
