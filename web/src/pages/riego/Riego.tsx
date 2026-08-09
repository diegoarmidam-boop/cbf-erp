import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import type { RiegoDiaResponse, RiegoRegistroDiario, SeccionRiego } from "../../lib/types";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Riego() {
  const { huertas } = useHuertas();

  const [huertaId, setHuertaId] = useState("");
  const [secciones, setSecciones] = useState<SeccionRiego[]>([]);
  const [seccionId, setSeccionId] = useState("");
  const [fecha, setFecha] = useState(hoyISO());

  const [dia, setDia] = useState<RiegoDiaResponse | null>(null);
  const [historial, setHistorial] = useState<RiegoRegistroDiario[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [horas, setHoras] = useState("");
  const [fertirriegoConfirmado, setFertirriegoConfirmado] = useState(false);
  const [cantidadAplicada, setCantidadAplicada] = useState("");

  useEffect(() => {
    if (!huertaId) {
      setSecciones([]);
      setSeccionId("");
      return;
    }
    api.get<SeccionRiego[]>(`/secciones-riego?huertaId=${huertaId}`).then((s) => {
      setSecciones(s);
      if (s.length > 0) setSeccionId(s[0]!.id);
    });
  }, [huertaId]);

  useEffect(() => {
    if (!huertaId && huertas.length > 0) setHuertaId(huertas[0]!.id);
  }, [huertas, huertaId]);

  function cargarDia() {
    if (!seccionId || !fecha) return;
    setCargando(true);
    setError(null);
    setMensaje(null);
    api
      .get<RiegoDiaResponse>(`/riego/${seccionId}/${fecha}`)
      .then((r) => {
        setDia(r);
        setHoras(r.registro ? r.registro.horas : "");
        setFertirriegoConfirmado(r.registro?.fertirriegoConfirmado ?? false);
        setCantidadAplicada(r.registro?.cantidadAplicada ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
    api.get<RiegoRegistroDiario[]>(`/riego/${seccionId}/historial`).then(setHistorial);
  }

  useEffect(cargarDia, [seccionId, fecha]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      await api.post(`/riego/${seccionId}/${fecha}`, {
        horas: Number(horas),
        fertirriegoConfirmado,
        cantidadAplicada: fertirriegoConfirmado ? Number(cantidadAplicada) : undefined,
      });
      setMensaje("Guardado.");
      cargarDia();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Riego</h2>

      <div className="card" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 18 }}>
        <label className="field">
          Huerta
          <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)}>
            <option value="">Selecciona…</option>
            {huertas.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Sección de Riego
          <select value={seccionId} onChange={(e) => setSeccionId(e.target.value)}>
            <option value="">Selecciona…</option>
            {secciones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </div>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
      {mensaje && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{mensaje}</div>}

      {!seccionId ? (
        <p style={{ color: "var(--ink-soft)" }}>Elige una Huerta y una Sección de Riego.</p>
      ) : cargando ? (
        <p>Cargando…</p>
      ) : (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <label className="field">
            Horas regadas
            <input type="number" step="0.25" value={horas} onChange={(e) => setHoras(e.target.value)} />
          </label>

          {dia?.fertirriegoActivo ? (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink)" }}>
                <input type="checkbox" checked={fertirriegoConfirmado} onChange={(e) => setFertirriegoConfirmado(e.target.checked)} />
                ¿Se metió el fertirriego programado hoy? ({dia.fertirriegoActivo.producto.nombreComercial})
              </label>
              {fertirriegoConfirmado && (
                <label className="field">
                  Cantidad aplicada ({dia.fertirriegoActivo.producto.unidad})
                  <input type="number" step="0.0001" value={cantidadAplicada} onChange={(e) => setCantidadAplicada(e.target.value)} />
                </label>
              )}
            </>
          ) : (
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>No hay un fertirriego programado y entregado para esta Sección hoy.</span>
          )}

          <div>
            <button className="btn-primary" onClick={guardar} disabled={guardando}>
              Guardar
            </button>
          </div>
        </div>
      )}

      {seccionId && historial.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Horas</th>
              <th>Fertirriego</th>
              <th>Cantidad aplicada</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((h) => (
              <tr key={h.id}>
                <td>{h.fecha.slice(0, 10)}</td>
                <td>{h.horas}</td>
                <td>{h.fertirriegoConfirmado ? "Sí" : "No"}</td>
                <td>{h.fertirriegoConfirmado ? h.cantidadAplicada : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
