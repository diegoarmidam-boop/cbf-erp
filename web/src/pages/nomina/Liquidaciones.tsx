import { useEffect, useState } from "react";
import { api, ApiError, getToken } from "../../lib/api";
import { usePersonal } from "../../lib/usePersonal";
import type { Liquidacion, LiquidacionCalculada } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha, formatearInstante } from "../../lib/fecha";

function formaDinero(valor: number | string): string {
  return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

// Liquidaciones (9.11, 15-ago-2026): pago fuera de ciclo para personal
// eventual/destajo que deja de venir a mitad del periodo. Solo activa bajo
// demanda — no forma parte del flujo semanal automático.
export default function Liquidaciones() {
  const { personal } = usePersonal();
  const destajo = personal.filter((p) => p.tipo === "destajo");

  const [historial, setHistorial] = useState<Liquidacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [personalIds, setPersonalIds] = useState<string[]>([]);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [calculos, setCalculos] = useState<LiquidacionCalculada[] | null>(null);
  const [prestamosConfirmados, setPrestamosConfirmados] = useState<Record<string, string[]>>({});
  const [calculando, setCalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  function cargarHistorial() {
    api.get<Liquidacion[]>("/nomina/liquidaciones").then(setHistorial);
  }

  useEffect(cargarHistorial, []);

  function abrirForm() {
    setMostrarForm(true);
    setCalculos(null);
    setPersonalIds([]);
    setPrestamosConfirmados({});
    api.get<{ fechaInicio: string; fechaFin: string }>("/nomina/liquidaciones/rango-default").then((r) => {
      setFechaInicio(r.fechaInicio);
      setFechaFin(r.fechaFin);
    });
  }

  function alternarPersona(id: string) {
    setPersonalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function calcular() {
    setError(null);
    setCalculando(true);
    try {
      const resultados = await Promise.all(
        personalIds.map((personalId) =>
          api.post<LiquidacionCalculada>("/nomina/liquidaciones/calcular", { personalId, fechaInicio, fechaFin })
        )
      );
      setCalculos(resultados);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo calcular la liquidación.");
    } finally {
      setCalculando(false);
    }
  }

  function togglePrestamo(personalId: string, prestamoId: string) {
    setPrestamosConfirmados((prev) => {
      const actuales = prev[personalId] ?? [];
      const nuevos = actuales.includes(prestamoId) ? actuales.filter((x) => x !== prestamoId) : [...actuales, prestamoId];
      return { ...prev, [personalId]: nuevos };
    });
  }

  async function confirmarLiquidaciones() {
    if (!calculos) return;
    setError(null);
    setGuardando(true);
    try {
      for (const c of calculos) {
        await api.post("/nomina/liquidaciones", {
          personalId: c.personalId,
          fechaInicio,
          fechaFin,
          prestamosADescontar: prestamosConfirmados[c.personalId] ?? [],
        });
      }
      setMensaje(`${calculos.length} liquidación(es) guardada(s).`);
      setMostrarForm(false);
      setCalculos(null);
      cargarHistorial();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la liquidación.");
    } finally {
      setGuardando(false);
    }
  }

  function descargarPdf(id: string, nombre: string) {
    const token = getToken();
    fetch(`${api.apiUrl}/nomina/liquidaciones/${id}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `liquidacion-${nombre}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  async function reactivar(personalId: string) {
    setError(null);
    try {
      await api.post("/nomina/liquidaciones/reactivar-disponibilidad", { personalId });
      setMensaje("Disponibilidad reactivada — ya puede volver a capturarse en Captura del día.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reactivar.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => (mostrarForm ? setMostrarForm(false) : abrirForm())}>
          {mostrarForm ? "Cancelar" : "+ Nueva liquidación"}
        </button>
      </div>

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 10 }}>
            Solo personal eventual/destajo. El rango por default va del día siguiente al último cierre de Nómina (a nivel empresa) hasta hoy —
            ajústalo si el último día trabajado fue antes.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <label className="field">
              Desde
              <FechaInput value={fechaInicio} onChange={setFechaInicio} required />
            </label>
            <label className="field">
              Hasta (último día trabajado)
              <FechaInput value={fechaFin} onChange={setFechaFin} required />
            </label>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            Personas a liquidar
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxHeight: 160, overflowY: "auto", padding: "6px 0" }}>
              {destajo.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5 }}>
                  <input type="checkbox" checked={personalIds.includes(p.id)} onChange={() => alternarPersona(p.id)} />
                  {p.nombreCompleto}
                </label>
              ))}
            </div>
          </div>

          <button className="btn-primary" onClick={calcular} disabled={personalIds.length === 0 || calculando}>
            {calculando ? "Calculando…" : "Calcular"}
          </button>

          {calculos && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {calculos.map((c) => {
                const descuentoSeleccionado = (prestamosConfirmados[c.personalId] ?? []).reduce((s, id) => {
                  const p = c.prestamosPendientes.find((x) => x.prestamoId === id);
                  return s + (p?.montoSugerido ?? 0);
                }, 0);
                return (
                  <div key={c.personalId} className="card" style={{ background: "var(--surface-soft, #fafafa)" }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{c.nombreCompleto}</div>
                    <div style={{ fontSize: 12.5, display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span>Bruto: {formaDinero(c.bruto)}</span>
                      <span>Bonos: {formaDinero(c.bonos)}</span>
                      <span style={{ fontWeight: 600 }}>Neto: {formaDinero(c.bruto + c.bonos - descuentoSeleccionado)}</span>
                    </div>
                    {c.prestamosPendientes.length > 0 && (
                      <div style={{ marginTop: 8, padding: 8, background: "var(--pink-soft, #fdebf3)", borderRadius: 8 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>⚠ Tiene préstamo(s) pendiente(s) — no se descuenta solo:</div>
                        {c.prestamosPendientes.map((p) => (
                          <label key={p.prestamoId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 4 }}>
                            <input
                              type="checkbox"
                              checked={(prestamosConfirmados[c.personalId] ?? []).includes(p.prestamoId)}
                              onChange={() => togglePrestamo(c.personalId, p.prestamoId)}
                            />
                            {p.motivo} — saldo {formaDinero(p.saldoPendiente)}, descontar {formaDinero(p.montoSugerido)} en esta liquidación
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <button className="btn-primary" onClick={confirmarLiquidaciones} disabled={guardando} style={{ width: "fit-content" }}>
                {guardando ? "Guardando…" : "Confirmar liquidación(es)"}
              </button>
            </div>
          )}
        </div>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
      {mensaje && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{mensaje}</div>}

      <h3 style={{ marginBottom: 10 }}>Historial</h3>
      <table>
        <thead>
          <tr>
            <th>Persona</th>
            <th>Periodo</th>
            <th>Bruto</th>
            <th>Bonos</th>
            <th>Descuentos</th>
            <th>Neto</th>
            <th>Liquidada</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {historial.map((l) => (
            <tr key={l.id}>
              <td>{l.personal.nombreCompleto}</td>
              <td>
                {formatearFecha(l.fechaInicio)} a {formatearFecha(l.fechaFin)}
              </td>
              <td>{formaDinero(l.bruto)}</td>
              <td>{formaDinero(l.bonos)}</td>
              <td>{formaDinero(l.descuentoPrestamos)}</td>
              <td style={{ fontWeight: 600 }}>{formaDinero(l.neto)}</td>
              <td>{formatearInstante(l.fechaLiquidacion)}</td>
              <td style={{ display: "flex", gap: 6 }}>
                <button className="btn-secondary" onClick={() => descargarPdf(l.id, l.personal.nombreCompleto)}>
                  Sobre PDF
                </button>
                <button className="btn-secondary" onClick={() => reactivar(l.personalId)}>
                  Reactivar
                </button>
              </td>
            </tr>
          ))}
          {historial.length === 0 && (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                Sin liquidaciones todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
