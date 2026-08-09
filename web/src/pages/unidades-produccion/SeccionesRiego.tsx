import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useCuadros } from "../../lib/useCuadros";
import type { SeccionRiego } from "../../lib/types";
import { useHuertaSeleccionada } from "./HuertaSeleccionadaContext";

export default function SeccionesRiego() {
  const { huertaId } = useHuertaSeleccionada();
  const { cuadros } = useCuadros(huertaId);
  const [secciones, setSecciones] = useState<SeccionRiego[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [cuadroIds, setCuadroIds] = useState<string[]>([]);

  function cargar() {
    if (!huertaId) return;
    api
      .get<SeccionRiego[]>(`/secciones-riego?huertaId=${huertaId}`)
      .then(setSecciones)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  useEffect(cargar, [huertaId]);

  function toggleCuadro(id: string) {
    setCuadroIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/secciones-riego", { huertaId, nombre, cuadroIds });
      setNombre("");
      setCuadroIds([]);
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Nueva Sección de Riego"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ marginBottom: 18 }}>
          <label className="field" style={{ marginBottom: 12, maxWidth: 280 }}>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>Cuadros que comparten esta válvula</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {cuadros.map((c) => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5 }}>
                <input type="checkbox" checked={cuadroIds.includes(c.id)} onChange={() => toggleCuadro(c.id)} />
                {c.nombre}
              </label>
            ))}
          </div>
          <button className="btn-primary" type="submit">
            Guardar
          </button>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Cuadros</th>
          </tr>
        </thead>
        <tbody>
          {secciones.map((s) => (
            <tr key={s.id}>
              <td>{s.nombre}</td>
              <td>{s.cuadros.map((c) => c.cuadro.nombre).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
