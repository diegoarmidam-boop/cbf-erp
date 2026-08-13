import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { OrdenCxP } from "../../lib/types";
import { formatearFecha, formatearInstante } from "../../lib/fecha";

export default function CxP() {
  const [ordenes, setOrdenes] = useState<OrdenCxP[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  function cargar() {
    setCargando(true);
    api
      .get<OrdenCxP[]>("/compras/cxp")
      .then(setOrdenes)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function marcarPagada(id: string) {
    if (!confirm("¿Marcar esta orden como pagada?")) return;
    setError(null);
    try {
      await api.post(`/compras/ordenes/${id}/marcar-pagada`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo marcar como pagada.");
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
        Órdenes formalizadas con crédito de proveedor, pendientes de pago. El pago siempre es en viernes — la alerta se muestra desde el
        miércoles anterior a la fecha límite.
      </p>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Producto</th>
              <th>Formalizada</th>
              <th>Días de crédito</th>
              <th>Fecha límite de pago</th>
              <th>Viernes de pago</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ordenes.map((o) => (
              <tr key={o.id} style={o.alertaVisible ? { background: "var(--pink-soft, #fdeef1)" } : undefined}>
                <td>{o.proveedor.nombre}</td>
                <td>{o.producto.nombreComercial}</td>
                <td>{formatearInstante(o.fechaFormalizacion)}</td>
                <td>{o.proveedor.diasCredito}</td>
                <td>{formatearFecha(o.fechaLimitePago)}</td>
                <td>
                  {formatearFecha(o.viernesDePago)}
                  {o.alertaVisible && <span className="tag tag-danger" style={{ marginLeft: 6 }}>Próxima a vencer</span>}
                </td>
                <td>
                  <button className="btn-primary" onClick={() => marcarPagada(o.id)}>
                    Marcar como pagada
                  </button>
                </td>
              </tr>
            ))}
            {ordenes.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                  No hay cuentas por pagar pendientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
