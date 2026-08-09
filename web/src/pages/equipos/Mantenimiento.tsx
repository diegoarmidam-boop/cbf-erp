import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useEquipoSeleccionado } from "./EquipoSeleccionadoContext";
import type { AlertaMantenimiento, MantenimientoConcepto, MantenimientoEvento } from "../../lib/types";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Mantenimiento() {
  const { equipoId } = useEquipoSeleccionado();
  const [conceptos, setConceptos] = useState<MantenimientoConcepto[]>([]);
  const [alertas, setAlertas] = useState<AlertaMantenimiento[]>([]);
  const [eventos, setEventos] = useState<MantenimientoEvento[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [mostrarConcepto, setMostrarConcepto] = useState(false);
  const [nombreConcepto, setNombreConcepto] = useState("");
  const [umbralHoras, setUmbralHoras] = useState("");

  const [mostrarEvento, setMostrarEvento] = useState(false);
  const [tipoEvento, setTipoEvento] = useState<"preventivo" | "correctivo">("correctivo");
  const [conceptoId, setConceptoId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [mecanicoInterno, setMecanicoInterno] = useState(true);
  const [costo, setCosto] = useState("");
  const [fechaEvento, setFechaEvento] = useState(hoyISO());

  function cargar() {
    if (!equipoId) return;
    api.get<MantenimientoConcepto[]>(`/equipos/mantenimiento/${equipoId}/conceptos`).then(setConceptos);
    api.get<AlertaMantenimiento[]>(`/equipos/mantenimiento/${equipoId}/alertas`).then(setAlertas);
    api.get<MantenimientoEvento[]>(`/equipos/mantenimiento/${equipoId}/eventos`).then(setEventos);
  }

  useEffect(cargar, [equipoId]);

  async function crearConcepto(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/equipos/mantenimiento/${equipoId}/conceptos`, { nombre: nombreConcepto, umbralHoras: Number(umbralHoras) });
      setNombreConcepto("");
      setUmbralHoras("");
      setMostrarConcepto(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  async function crearEvento(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/equipos/mantenimiento/${equipoId}/eventos`, {
        tipo: tipoEvento,
        conceptoId: tipoEvento === "preventivo" ? conceptoId || undefined : undefined,
        descripcion,
        mecanicoInterno,
        costo: costo ? Number(costo) : undefined,
        fecha: fechaEvento,
      });
      setDescripcion("");
      setCosto("");
      setMostrarEvento(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  if (!equipoId) return <p style={{ color: "var(--ink-soft)" }}>No hay equipos dados de alta todavía.</p>;

  return (
    <div>
      {alertas.some((a) => a.vencido) && (
        <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 16 }}>
          {alertas
            .filter((a) => a.vencido)
            .map((a) => `${a.nombre} vencido (${a.horasAcumuladasDesdeUltimoServicio.toFixed(0)}h / ${a.umbralHoras}h)`)
            .join(" · ")}
        </div>
      )}

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3>Conceptos de servicio</h3>
            <button className="btn-secondary" onClick={() => setMostrarConcepto((v) => !v)}>
              {mostrarConcepto ? "Cancelar" : "+ Concepto"}
            </button>
          </div>
          {mostrarConcepto && (
            <form onSubmit={crearConcepto} className="card" style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 14 }}>
              <label className="field">
                Nombre
                <input value={nombreConcepto} onChange={(e) => setNombreConcepto(e.target.value)} placeholder="Filtro de diésel" required />
              </label>
              <label className="field">
                Umbral (horas)
                <input type="number" value={umbralHoras} onChange={(e) => setUmbralHoras(e.target.value)} required />
              </label>
              <button className="btn-primary" type="submit">
                Guardar
              </button>
            </form>
          )}
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Umbral</th>
              </tr>
            </thead>
            <tbody>
              {conceptos.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td>{c.umbralHoras}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ flex: "1 1 400px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3>Eventos</h3>
            <button className="btn-secondary" onClick={() => setMostrarEvento((v) => !v)}>
              {mostrarEvento ? "Cancelar" : "+ Evento"}
            </button>
          </div>
          {mostrarEvento && (
            <form onSubmit={crearEvento} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
              <label className="field">
                Tipo
                <select value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value as typeof tipoEvento)}>
                  <option value="preventivo">Preventivo</option>
                  <option value="correctivo">Correctivo</option>
                </select>
              </label>
              {tipoEvento === "preventivo" && (
                <label className="field">
                  Concepto
                  <select value={conceptoId} onChange={(e) => setConceptoId(e.target.value)}>
                    <option value="">—</option>
                    {conceptos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                Descripción
                <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />
              </label>
              <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={mecanicoInterno} onChange={(e) => setMecanicoInterno(e.target.checked)} />
                Mecánico interno
              </label>
              <label className="field">
                Costo
                <input type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />
              </label>
              <label className="field">
                Fecha
                <input type="date" value={fechaEvento} onChange={(e) => setFechaEvento(e.target.value)} required />
              </label>
              <button className="btn-primary" type="submit">
                Guardar
              </button>
            </form>
          )}
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th>Costo</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td>{e.fecha.slice(0, 10)}</td>
                  <td>{e.tipo}</td>
                  <td>{e.descripcion}</td>
                  <td>{e.costo ? `$${e.costo}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginTop: 12 }}>{error}</div>}
    </div>
  );
}
