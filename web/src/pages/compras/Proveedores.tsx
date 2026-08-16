import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { Proveedor } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";

export default function Proveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [creditoMonto, setCreditoMonto] = useState("");
  const [creditoVencimiento, setCreditoVencimiento] = useState("");
  const [diasCredito, setDiasCredito] = useState("");
  const [editandoDiasId, setEditandoDiasId] = useState<string | null>(null);
  const [diasCreditoEdit, setDiasCreditoEdit] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  function cargar() {
    api
      .get<Proveedor[]>("/compras/proveedores?todas=true")
      .then(setProveedores)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  useEffect(cargar, []);

  async function toggleActivo(p: Proveedor) {
    setError(null);
    try {
      await api.patch(`/compras/proveedores/${p.id}/activo`, { activo: !p.activo });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar.");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      nombre,
      creditoMonto: creditoMonto ? Number(creditoMonto) : undefined,
      creditoVencimiento: creditoVencimiento || undefined,
      diasCredito: diasCredito ? Number(diasCredito) : undefined,
    };
    try {
      if (editandoId) {
        await api.patch(`/compras/proveedores/${editandoId}`, payload);
      } else {
        await api.post("/compras/proveedores", payload);
      }
      setNombre("");
      setCreditoMonto("");
      setCreditoVencimiento("");
      setDiasCredito("");
      setMostrarForm(false);
      setEditandoId(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  function iniciarEdicion(p: Proveedor) {
    setEditandoId(p.id);
    setNombre(p.nombre);
    setCreditoMonto(p.creditoMonto != null ? String(p.creditoMonto) : "");
    setCreditoVencimiento(p.creditoVencimiento ? p.creditoVencimiento.slice(0, 10) : "");
    setDiasCredito(p.diasCredito != null ? String(p.diasCredito) : "");
    setError(null);
    setMostrarForm(true);
  }

  async function guardarDiasCredito(id: string) {
    setError(null);
    try {
      await api.patch(`/compras/proveedores/${id}/dias-credito`, { diasCredito: Number(diasCreditoEdit) });
      setEditandoDiasId(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button
          className="btn-primary"
          onClick={() => {
            if (mostrarForm) {
              setEditandoId(null);
              setNombre("");
              setCreditoMonto("");
              setCreditoVencimiento("");
              setDiasCredito("");
            }
            setMostrarForm((v) => !v);
          }}
        >
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
            <FechaInput value={creditoVencimiento} onChange={setCreditoVencimiento} />
          </label>
          <label className="field">
            Días de crédito
            <input type="number" min={0} step="1" value={diasCredito} onChange={(e) => setDiasCredito(e.target.value)} placeholder="Ej. 15" />
          </label>
          <button className="btn-primary" type="submit">
            {editandoId ? "Guardar cambios" : "Guardar"}
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
            <th>Días de crédito</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {proveedores.map((p) => (
            <tr key={p.id}>
              <td>{p.nombre}</td>
              <td>{p.creditoMonto ? `$${p.creditoMonto}` : "—"}</td>
              <td>{formatearFecha(p.creditoVencimiento)}</td>
              <td>
                {editandoDiasId === p.id ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      style={{ width: 70 }}
                      value={diasCreditoEdit}
                      onChange={(e) => setDiasCreditoEdit(e.target.value)}
                      autoFocus
                    />
                    <button className="btn-secondary" onClick={() => guardarDiasCredito(p.id)}>
                      Guardar
                    </button>
                    <button className="btn-secondary" onClick={() => setEditandoDiasId(null)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setEditandoDiasId(p.id);
                      setDiasCreditoEdit(p.diasCredito != null ? String(p.diasCredito) : "");
                    }}
                  >
                    {p.diasCredito != null ? `${p.diasCredito} días` : "Sin definir"}
                  </button>
                )}
              </td>
              <td>
                <span className={`tag ${p.activo ? "tag-success" : "tag-danger"}`}>{p.activo ? "Activo" : "Inactivo"}</span>
              </td>
              <td style={{ display: "flex", gap: 6 }}>
                <button className="btn-secondary" onClick={() => iniciarEdicion(p)}>
                  Editar
                </button>
                <button className="btn-secondary" onClick={() => toggleActivo(p)}>
                  {p.activo ? "Desactivar" : "Reactivar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
