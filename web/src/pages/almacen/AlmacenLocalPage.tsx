import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import type { AlmacenLocalEntrada, CandadoAlmacenLocal } from "../../lib/types";
import { formatearNumero } from "../../lib/numero";

export default function AlmacenLocalPage() {
  const { huertas, cargando: cargandoHuertas } = useHuertas();
  // ?huertaId= (29-ago-2026): pre-llenado desde una notificación de
  // descuadre — si trae una Huerta válida, se usa esa en vez de la primera
  // de la lista.
  const [searchParams] = useSearchParams();
  const [huertaId, setHuertaId] = useState(searchParams.get("huertaId") || "");
  const [entradas, setEntradas] = useState<AlmacenLocalEntrada[]>([]);
  const [candados, setCandados] = useState<CandadoAlmacenLocal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!huertaId && huertas.length > 0) setHuertaId(huertas[0]!.id);
  }, [huertas, huertaId]);

  function cargar() {
    if (!huertaId) return;
    Promise.all([
      api.get<AlmacenLocalEntrada[]>(`/almacen/local/${huertaId}`),
      api.get<CandadoAlmacenLocal[]>(`/almacen/local/${huertaId}/candados`),
    ])
      .then(([e, c]) => {
        setEntradas(e);
        setCandados(c);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  useEffect(cargar, [huertaId]);

  async function reportarConsumo(almacenLocalId: string) {
    const cantidad = Number(cantidades[almacenLocalId]);
    if (!cantidad || cantidad <= 0) return;
    setError(null);
    try {
      await api.post(`/almacen/local/${almacenLocalId}/reportar-consumo`, { cantidad });
      setCantidades((prev) => ({ ...prev, [almacenLocalId]: "" }));
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reportar.");
    }
  }

  if (cargandoHuertas) return <p>Cargando…</p>;
  if (huertas.length === 0) return <p style={{ color: "var(--ink-soft)" }}>No hay Huertas dadas de alta.</p>;

  return (
    <div>
      <label className="field" style={{ marginBottom: 16, maxWidth: 280 }}>
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

      {candados.some((c) => c.alertaActiva) && (
        <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>
          Hay descuadres de más de 15 días sin justificar en esta Huerta — Gerencia debe investigar.
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Recibido</th>
            <th>Reportado</th>
            <th>Saldo sin justificar</th>
            <th>Días desde última entrega</th>
            <th>Reportar consumo</th>
          </tr>
        </thead>
        <tbody>
          {entradas.map((e) => {
            const candado = candados.find((c) => c.productoId === e.productoId);
            const resaltada = searchParams.get("productoId") === e.productoId;
            return (
              <tr key={e.id} style={resaltada ? { background: "var(--pink-soft)" } : undefined}>
                <td>{e.producto.nombreComercial}</td>
                <td>{formatearNumero(e.cantidadRecibidaAcumulada)}</td>
                <td>{formatearNumero(e.cantidadReportadaAcumulada)}</td>
                <td>
                  {candado ? formatearNumero(candado.saldoSinJustificar, 2) : ""}{" "}
                  {candado?.alertaActiva && <span className="tag tag-danger">Descuadre &gt;15 días</span>}
                </td>
                <td>{candado?.diasDesdeUltimaEntrega ?? "—"}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  <input
                    type="number"
                    step="0.001"
                    style={{ width: 90 }}
                    value={cantidades[e.id] ?? ""}
                    onChange={(ev) => setCantidades((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                  />
                  <button className="btn-secondary" onClick={() => reportarConsumo(e.id)}>
                    Reportar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
