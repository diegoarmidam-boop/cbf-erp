import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { usePersonal } from "../../lib/usePersonal";
import type { Prestamo } from "../../lib/types";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Prestamos() {
  const { personal } = usePersonal();
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (!confirm("¿Cancelar este préstamo? Solo se puede si todavía no tiene descuentos aplicados.")) return;
    setError(null);
    try {
      await api.post(`/nomina/prestamos/${id}/cancelar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cancelar.");
    }
  }

  async function aplicarDescuento(id: string) {
    setError(null);
    try {
      await api.post(`/nomina/prestamos/${id}/aplicar-descuento`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aplicar el descuento.");
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
          <input type="date" value={fechaPrimerDescuento} onChange={(e) => setFechaPrimerDescuento(e.target.value)} required />
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {prestamos.map((p) => (
              <tr key={p.id}>
                <td>{p.personal?.nombreCompleto}</td>
                <td>${Number(p.saldoPendiente).toFixed(2)}</td>
                <td>${Number(p.montoPorDescuento).toFixed(2)}</td>
                <td>{p.proximoDescuento.slice(0, 10)}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="btn-secondary" onClick={() => aplicarDescuento(p.id)}>
                    Aplicar descuento
                  </button>
                  <button className="btn-danger" onClick={() => cancelar(p.id)}>
                    Cancelar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
