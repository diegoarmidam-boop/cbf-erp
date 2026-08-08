import { useEffect, useState } from "react";
import { api, ApiError, getToken } from "../../lib/api";
import type { ReporteNominaSemanal } from "../../lib/types";

export default function ReporteSemanal() {
  const [reporte, setReporte] = useState<ReporteNominaSemanal | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  function cargar() {
    setCargando(true);
    api
      .get<ReporteNominaSemanal>("/nomina/reporte/semanal")
      .then(setReporte)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el reporte."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function confirmarSemana() {
    setConfirmando(true);
    setError(null);
    try {
      await api.post("/nomina/reporte/semanal/confirmar");
      setMostrarConfirmacion(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar la semana.");
    } finally {
      setConfirmando(false);
    }
  }

  function descargarSobres() {
    const token = getToken();
    fetch(`${api.apiUrl}/nomina/reporte/semanal/sobres.pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "nomina-sobres.pdf";
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  if (cargando) return <p>Cargando…</p>;
  if (error) return <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px" }}>{error}</div>;
  if (!reporte) return null;

  const totalNeto = reporte.filas.reduce((s, f) => s + f.neto, 0);
  const totalDescuentos = reporte.filas.reduce((s, f) => s + f.descuentoPrestamos, 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div className="kpi-card">
          <div className="label">Periodo</div>
          <div className="value" style={{ fontSize: 14 }}>
            {reporte.periodo.inicio} — {reporte.periodo.fin}
          </div>
        </div>
        <div className="kpi-card">
          <div className="label">Total neto a pagar</div>
          <div className="value">${totalNeto.toFixed(2)}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Descuentos de préstamo</div>
          <div className="value">${totalDescuentos.toFixed(2)}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Personas</div>
          <div className="value">{reporte.filas.length}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button className="btn-secondary" onClick={descargarSobres}>
          Exportar sobres (PDF)
        </button>
        <button className="btn-primary" onClick={() => setMostrarConfirmacion(true)}>
          Confirmar semana
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Persona</th>
            <th>Tipo</th>
            <th>Bruto</th>
            <th>Bonos</th>
            <th>Descuentos</th>
            <th>Neto</th>
          </tr>
        </thead>
        <tbody>
          {reporte.filas.map((f) => (
            <tr key={f.personalId}>
              <td>{f.nombreCompleto}</td>
              <td>{f.tipo}</td>
              <td>${f.bruto.toFixed(2)}</td>
              <td>${f.bonos.toFixed(2)}</td>
              <td>-${f.descuentoPrestamos.toFixed(2)}</td>
              <td style={{ fontWeight: 700 }}>${f.neto.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {mostrarConfirmacion && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div className="card" style={{ width: 380 }}>
            <h3 style={{ marginBottom: 10 }}>Confirmar semana de nómina</h3>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              Esto aplica de verdad los descuentos de préstamo de esta semana (${totalDescuentos.toFixed(2)} en total) — no se puede
              deshacer desde aquí.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setMostrarConfirmacion(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={confirmarSemana} disabled={confirmando}>
                {confirmando ? "Confirmando…" : "Sí, confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
