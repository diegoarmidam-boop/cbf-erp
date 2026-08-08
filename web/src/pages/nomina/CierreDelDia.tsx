import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import type { DiaPendiente } from "../../lib/types";

function tagEstado(estado: DiaPendiente["estado"]) {
  if (estado === "al_corriente") return <span className="tag tag-success">Al corriente</span>;
  if (estado === "vence_hoy") return <span className="tag tag-warning">Vence hoy</span>;
  return <span className="tag tag-danger">Vencido</span>;
}

export default function CierreDelDia() {
  const { huertas, cargando: cargandoHuertas } = useHuertas();
  const [huertaId, setHuertaId] = useState("");
  const [pendientes, setPendientes] = useState<DiaPendiente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!huertaId && huertas.length > 0) setHuertaId(huertas[0]!.id);
  }, [huertas, huertaId]);

  function cargarPendientes() {
    if (!huertaId) return;
    setCargando(true);
    api
      .get<DiaPendiente[]>(`/nomina/cierre/pendientes?huertaId=${huertaId}`)
      .then(setPendientes)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargarPendientes, [huertaId]);

  async function cerrar(fecha: string) {
    setError(null);
    try {
      await api.post(`/nomina/cierre/${huertaId}/${fecha}`);
      cargarPendientes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cerrar el día.");
    }
  }

  if (cargandoHuertas) return <p>Cargando…</p>;
  if (huertas.length === 0) return <p style={{ color: "var(--ink-soft)" }}>No hay Huertas dadas de alta todavía.</p>;

  return (
    <div>
      <label className="field" style={{ marginBottom: 16, maxWidth: 260 }}>
        Huerta
        <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)}>
          {huertas.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nombre}
            </option>
          ))}
        </select>
      </label>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      <div className="card">
        {cargando ? (
          <p>Cargando…</p>
        ) : pendientes.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>No hay días pendientes de cerrar en esta Huerta.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Plazo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((d) => (
                <tr key={d.fecha}>
                  <td>{d.fecha}</td>
                  <td>{tagEstado(d.estado)}</td>
                  <td>
                    <button className="btn-primary" onClick={() => cerrar(d.fecha)}>
                      Cerrar día
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
