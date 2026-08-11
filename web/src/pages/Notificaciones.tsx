import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { Notificacion, SolicitudPendiente } from "../lib/types";

const ETIQUETAS_TIPO_SOLICITUD: Record<string, string> = {
  actividad_alta: "Nueva actividad",
  actividad_tarifa: "Cambio de tarifa de actividad",
  personal_alta: "Alta de personal",
  producto_alta: "Nuevo producto de almacén",
  producto_regulado_alta: "Nuevo agroquímico/fertilizante",
  orden_compra_manual: "Orden de compra manual",
};

function resumenPayload(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

export default function Notificaciones() {
  const [solicitudes, setSolicitudes] = useState<SolicitudPendiente[]>([]);
  const [alertas, setAlertas] = useState<Notificacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState<Record<string, string>>({});

  function cargar() {
    api
      .get<SolicitudPendiente[]>("/solicitudes")
      .then(setSolicitudes)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
    api
      .get<Notificacion[]>("/notificaciones")
      .then((r) => setAlertas(r.filter((n) => n.tipo !== "solicitud")))
      .catch(() => setAlertas([]));
  }

  useEffect(cargar, []);

  async function autorizar(id: string) {
    setError(null);
    try {
      await api.post(`/solicitudes/${id}/autorizar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo autorizar.");
    }
  }

  async function rechazar(id: string) {
    setError(null);
    try {
      await api.post(`/solicitudes/${id}/rechazar`, { motivoRechazo: motivoRechazo[id] || undefined });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo rechazar.");
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Notificaciones</h2>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      <h3 style={{ marginBottom: 10, fontSize: 14 }}>Pendientes de autorizar</h3>
      {solicitudes.length === 0 ? (
        <p style={{ color: "var(--ink-soft)", marginBottom: 20 }}>Nada pendiente de tu autorización en este momento.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {solicitudes.map((s) => (
            <div key={s.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <span className="tag tag-warning">{ETIQUETAS_TIPO_SOLICITUD[s.tipo] ?? s.tipo}</span>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
                    Propuesto: {s.fechaPropuesta.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
                <button className="btn-primary" onClick={() => autorizar(s.id)}>
                  Autorizar
                </button>
              </div>
              <div style={{ fontSize: 12.5, marginBottom: 10 }}>{resumenPayload(s.payload)}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  placeholder="Motivo de rechazo (opcional)"
                  style={{ flex: 1 }}
                  value={motivoRechazo[s.id] ?? ""}
                  onChange={(e) => setMotivoRechazo((prev) => ({ ...prev, [s.id]: e.target.value }))}
                />
                <button className="btn-secondary" onClick={() => rechazar(s.id)}>
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginBottom: 10, fontSize: 14 }}>Otras alertas</h3>
      {alertas.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>Sin otras alertas pendientes.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alertas.map((n) => (
            <Link
              key={n.id}
              to={n.enlace}
              className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", color: "inherit" }}
            >
              <div>
                <span className={`tag ${n.urgente ? "tag-danger" : "tag-neutral"}`}>{n.titulo}</span>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{n.detalle}</div>
              </div>
              <span style={{ fontSize: 18, color: "var(--ink-soft)" }}>→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
