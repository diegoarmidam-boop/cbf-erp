import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { DoNotHireEntry } from "../../lib/types";

export default function DoNotHire() {
  const { modulosVisibles } = useAuth();
  const puedeCapturar = modulosVisibles.includes("rh"); // solo RH captura; Supervisor/Gerente Técnico solo ven
  const [entradas, setEntradas] = useState<DoNotHireEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombreReferencia, setNombreReferencia] = useState("");
  const [motivo, setMotivo] = useState("");
  const [condicionesSalida, setCondicionesSalida] = useState("");

  function cargar() {
    api
      .get<DoNotHireEntry[]>("/rh/do-not-hire")
      .then(setEntradas)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  useEffect(cargar, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/rh/do-not-hire", { nombreReferencia, motivo, condicionesSalida: condicionesSalida || undefined });
      setNombreReferencia("");
      setMotivo("");
      setCondicionesSalida("");
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <div>
      {puedeCapturar && (
        <div style={{ marginBottom: 14 }}>
          <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? "Cancelar" : "+ Agregar a la lista"}
          </button>
        </div>
      )}

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
          <label className="field">
            Nombre
            <input value={nombreReferencia} onChange={(e) => setNombreReferencia(e.target.value)} required />
          </label>
          <label className="field">
            Motivo
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
          </label>
          <label className="field">
            Condiciones de salida
            <input value={condicionesSalida} onChange={(e) => setCondicionesSalida(e.target.value)} />
          </label>
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
            <th>Motivo</th>
            <th>Condiciones de salida</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {entradas.map((e) => (
            <tr key={e.id}>
              <td>{e.nombreReferencia}</td>
              <td>{e.motivo}</td>
              <td>{e.condicionesSalida ?? "—"}</td>
              <td>{e.fecha.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
