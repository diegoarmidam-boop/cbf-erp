import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";

export default function Huertas() {
  const { huertas, cargando, refetch } = useHuertas();
  const [nombre, setNombre] = useState("");
  const [hectareas, setHectareas] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/huertas", { nombre, hectareasTotales: Number(hectareas) });
      setNombre("");
      setHectareas("");
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <div>
      <h2>Unidades de Producción</h2>
      <p style={{ color: "var(--ink-soft)", fontSize: 12.5, marginTop: 4 }}>
        Vista mínima (solo alta de Huerta) para poder capturar Nómina — Cuadros, Ciclos, Marco de Plantación y
        Secciones de Riego llegan con el módulo completo.
      </p>

      <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 12, alignItems: "flex-end", marginTop: 16, marginBottom: 20 }}>
        <label className="field">
          Nombre de la Huerta
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label className="field">
          Hectáreas totales
          <input type="number" step="0.01" value={hectareas} onChange={(e) => setHectareas(e.target.value)} required />
        </label>
        <button className="btn-primary" type="submit">
          + Agregar Huerta
        </button>
      </form>
      {error && <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Hectáreas totales</th>
            </tr>
          </thead>
          <tbody>
            {huertas.map((h) => (
              <tr key={h.id}>
                <td>{h.nombre}</td>
                <td>{h.hectareasTotales}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
