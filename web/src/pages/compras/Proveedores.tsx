import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { Proveedor } from "../../lib/types";

export default function Proveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [creditoMonto, setCreditoMonto] = useState("");
  const [creditoVencimiento, setCreditoVencimiento] = useState("");

  function cargar() {
    api
      .get<Proveedor[]>("/compras/proveedores")
      .then(setProveedores)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  useEffect(cargar, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/compras/proveedores", {
        nombre,
        creditoMonto: creditoMonto ? Number(creditoMonto) : undefined,
        creditoVencimiento: creditoVencimiento || undefined,
      });
      setNombre("");
      setCreditoMonto("");
      setCreditoVencimiento("");
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
          {mostrarForm ? "Cancelar" : "+ Nuevo proveedor"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
          <label className="field">
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label className="field">
            Crédito otorgado
            <input type="number" step="0.01" value={creditoMonto} onChange={(e) => setCreditoMonto(e.target.value)} />
          </label>
          <label className="field">
            Vencimiento del crédito
            <input type="date" value={creditoVencimiento} onChange={(e) => setCreditoVencimiento(e.target.value)} />
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
            <th>Crédito</th>
            <th>Vence</th>
          </tr>
        </thead>
        <tbody>
          {proveedores.map((p) => (
            <tr key={p.id}>
              <td>{p.nombre}</td>
              <td>{p.creditoMonto ? `$${p.creditoMonto}` : "—"}</td>
              <td>{p.creditoVencimiento?.slice(0, 10) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
