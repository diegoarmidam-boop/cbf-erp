import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { usePersonal } from "../../lib/usePersonal";
import type { Prestamo } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";
import { formatearDinero } from "../../lib/numero";
import ConfirmModal from "../../components/ConfirmModal";

interface PeriodoNomina {
  inicio: string;
  fin: string;
}

function hoyISO(): string {
  const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Prestamos() {
  const { personal } = usePersonal();
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [periodoActual, setPeriodoActual] = useState<PeriodoNomina | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoAdelanto, setConfirmandoAdelanto] = useState<Prestamo | null>(null);
  const [confirmandoCancelarId, setConfirmandoCancelarId] = useState<string | null>(null);

  const [personalId, setPersonalId] = useState("");
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [periodicidad, setPeriodicidad] = useState<"semanal" | "quincenal">("semanal");
  const [montoDescuento, setMontoDescuento] = useState("");
  const [fechaPrimerDescuento, setFechaPrimerDescuento] = useState(hoyISO());

  function cargar() {
    setCargando(true);
    api
      .get<Prestamo[]>("/nomina/prestamos?activo=true")
      .then(setPrestamos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
    api.get<PeriodoNomina>("/nomina/prestamos/periodo-actual").then(setPeriodoActual);
  }

  useEffect(cargar, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/nomina/prestamos", {
        personalId,
        montoTotal: Number(monto),
        motivo,
        periodicidad,
        montoPorDescuento: Number(montoDescuento),
        fechaPrimerDescuento,
      });
      setMonto("");
      setMotivo("");
      setMontoDescuento("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el préstamo.");
    }
  }

  async function cancelar(id: string) {
    setError(null);
    try {
      await api.post(`/nomina/prestamos/${id}/cancelar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cancelar.");
    }
  }

  async function ejecutarAplicarDescuento(id: string) {
    setError(null);
    try {
      await api.post(`/nomina/prestamos/${id}/aplicar-descuento`);
      setConfirmandoAdelanto(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aplicar el descuento.");
    }
  }

  function estaPendiente(p: Prestamo): boolean {
    if (!periodoActual) return false;
    return p.proximoDescuento.slice(0, 10) <= periodoActual.fin;
  }

  function clicAplicarDescuento(p: Prestamo) {
    if (estaPendiente(p)) {
      ejecutarAplicarDescuento(p.id);
    } else {
      // Estado neutral: ya se aplicó el descuento de este periodo — picarle de nuevo adelantaría el del siguiente periodo.
      setConfirmandoAdelanto(p);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 20 }}>
        <label className="field">
          Persona
          <select value={personalId} onChange={(e) => setPersonalId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombreCompleto}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Monto total
          <input type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required />
        </label>
        <label className="field">
          Motivo
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
        </label>
        <label className="field">
          Periodicidad
          <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value as "semanal" | "quincenal")}>
            <option value="semanal">Semanal</option>
            <option value="quincenal">Quincenal</option>
          </select>
        </label>
        <label className="field">
          Descuento por periodo
          <input type="number" min={0} step="0.01" value={montoDescuento} onChange={(e) => setMontoDescuento(e.target.value)} required />
        </label>
        <label className="field">
          Primer descuento
          <FechaInput value={fechaPrimerDescuento} onChange={setFechaPrimerDescuento} required />
        </label>
        <button className="btn-primary" type="submit">
          + Registrar préstamo
        </button>
      </form>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Persona</th>
              <th>Saldo pendiente</th>
              <th>Descuento/periodo</th>
              <th>Próximo descuento</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {prestamos.map((p) => {
              const pendiente = estaPendiente(p);
              return (
                <tr key={p.id} style={pendiente ? { background: "var(--pink-soft, #fdeef1)" } : undefined}>
                  <td>{p.personal?.nombreCompleto}</td>
                  <td>{formatearDinero(p.saldoPendiente)}</td>
                  <td>{formatearDinero(p.montoPorDescuento)}</td>
                  <td>{formatearFecha(p.proximoDescuento)}</td>
                  <td>
                    <span className={`tag ${pendiente ? "tag-warning" : "tag-neutral"}`}>
                      {pendiente ? "Pendiente este periodo" : "Ya aplicado este periodo"}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className={pendiente ? "btn-primary" : "btn-secondary"} onClick={() => clicAplicarDescuento(p)}>
                      Aplicar descuento
                    </button>
                    <button className="btn-danger" onClick={() => setConfirmandoCancelarId(p.id)}>
                      Cancelar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {confirmandoAdelanto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ width: 400 }}>
            <h3 style={{ marginBottom: 10 }}>¿Adelantar el descuento?</h3>
            <p style={{ fontSize: 13, marginBottom: 14 }}>
              El descuento de este periodo para <strong>{confirmandoAdelanto.personal?.nombreCompleto}</strong> ya se aplicó. ¿Quieres
              descontar {formatearDinero(confirmandoAdelanto.montoPorDescuento)} correspondiente al periodo de{" "}
              {confirmandoAdelanto.periodicidad === "quincenal" ? "quincena" : "semana"} que termina el{" "}
              {formatearFecha(confirmandoAdelanto.proximoDescuento)}?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn-secondary" onClick={() => setConfirmandoAdelanto(null)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={() => ejecutarAplicarDescuento(confirmandoAdelanto.id)}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmandoCancelarId && (
        <ConfirmModal
          titulo="Cancelar préstamo"
          mensaje="Solo se puede si todavía no tiene descuentos aplicados. ¿Confirmar?"
          peligroso
          onCancelar={() => setConfirmandoCancelarId(null)}
          onConfirmar={async () => {
            await cancelar(confirmandoCancelarId);
            setConfirmandoCancelarId(null);
          }}
        />
      )}
    </div>
  );
}
