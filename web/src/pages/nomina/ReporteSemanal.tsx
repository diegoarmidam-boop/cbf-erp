import { useEffect, useState } from "react";
import { api, ApiError, getToken } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import type { ReporteNominaSemanal } from "../../lib/types";
import { formatearDinero } from "../../lib/numero";

// Ventana de navegación (29-ago-2026): 12 semanas hacia atrás desde hoy —
// no oculta datos más viejos en la base de datos, solo limita hasta dónde
// puede navegar la pantalla con las flechas.
const SEMANAS_VENTANA = 12;

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReporteSemanal() {
  const { huertas } = useHuertas();
  const [fechaRef, setFechaRef] = useState(hoyISO());
  const [huertaId, setHuertaId] = useState("");
  const [reporte, setReporte] = useState<ReporteNominaSemanal | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const hoy = hoyISO();
  const fechaRefMinima = sumarDias(hoy, -7 * (SEMANAS_VENTANA - 1));
  const puedeIrAtras = fechaRef > fechaRefMinima;
  const puedeIrAdelante = fechaRef < hoy;

  function query(extra: Record<string, string> = {}): string {
    const params = new URLSearchParams({ hoy: fechaRef, ...(huertaId ? { huertaId } : {}), ...extra });
    return params.toString();
  }

  function cargar() {
    setCargando(true);
    setError(null);
    api
      .get<ReporteNominaSemanal>(`/nomina/reporte/semanal?${query()}`)
      .then(setReporte)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el reporte."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [fechaRef, huertaId]);

  async function confirmarSemana() {
    setConfirmando(true);
    setError(null);
    try {
      await api.post(`/nomina/reporte/semanal/confirmar?hoy=${fechaRef}`);
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
    fetch(`${api.apiUrl}/nomina/reporte/semanal/sobres.pdf?${query()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `nomina-sobres-${reporte?.periodo.fin ?? fechaRef}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  const totalNeto = reporte?.filas.reduce((s, f) => s + f.neto, 0) ?? 0;
  const totalDescuentos = reporte?.filas.reduce((s, f) => s + f.descuentoPrestamos, 0) ?? 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn-secondary" onClick={() => setFechaRef((f) => sumarDias(f, -7))} disabled={!puedeIrAtras}>
          {"< Semana anterior"}
        </button>
        <div style={{ fontSize: 13, fontWeight: 600, minWidth: 190, textAlign: "center" }}>
          {reporte ? `${reporte.periodo.inicio} — ${reporte.periodo.fin}` : "…"}
        </div>
        <button className="btn-secondary" onClick={() => setFechaRef((f) => sumarDias(f, 7))} disabled={!puedeIrAdelante}>
          {"Semana siguiente >"}
        </button>
        {huertas.length > 1 && (
          <label className="field" style={{ minWidth: 180, marginLeft: 8 }}>
            Rancho
            <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)}>
              <option value="">Todas UPs</option>
              {huertas.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        {reporte?.confirmada && <span className="tag tag-neutral">Semana confirmada — cerrada permanentemente</span>}
      </div>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : !reporte ? null : (
        <>
          {/* 4.2 (20-ago-2026): sin flexWrap, esta fila de 4 tarjetas era la
              causa real de "la tabla se corta" — no cabía en un celular y
              arrastraba a todo .app-main a un scroll horizontal confuso que
              movía título, pestañas y tabla juntos en vez de solo la tabla. */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div className="kpi-card">
              <div className="label">Periodo</div>
              <div className="value" style={{ fontSize: 14 }}>
                {reporte.periodo.inicio} — {reporte.periodo.fin}
              </div>
            </div>
            <div className="kpi-card">
              <div className="label">Total neto a pagar</div>
              <div className="value">{formatearDinero(totalNeto)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Descuentos de préstamo</div>
              <div className="value">{formatearDinero(totalDescuentos)}</div>
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
            {!reporte.confirmada && (
              <button className="btn-primary" onClick={() => setMostrarConfirmacion(true)}>
                Confirmar semana
              </button>
            )}
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
                  <td>{formatearDinero(f.bruto)}</td>
                  <td>{formatearDinero(f.bonos)}</td>
                  <td>-{formatearDinero(f.descuentoPrestamos)}</td>
                  <td style={{ fontWeight: 700 }}>{formatearDinero(f.neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

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
              Esto aplica de verdad los descuentos de préstamo de esta semana ({formatearDinero(totalDescuentos)} en total) y bloquea la
              semana para edición de forma <strong>permanente</strong> — ni siquiera Dirección General podrá volver a tocarla después.
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
