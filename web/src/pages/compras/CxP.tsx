import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import type { OrdenCxP } from "../../lib/types";
import { formatearFecha, formatearInstante } from "../../lib/fecha";
import { formatearDinero } from "../../lib/numero";

interface TransferenciaNomina {
  personalId: string;
  nombreCompleto: string;
  monto: number;
  banco: string | null;
  numeroCuentaOClabe: string | null;
  titularCuenta: string | null;
}

/** El viernes de ESTA semana (calendario) — para pedir las transferencias de Nómina de esa fecha (V1 P6, 27-sep-2026, 9.11c). */
function viernesDeEstaSemana(): string {
  const d = new Date();
  const dow = d.getDay(); // 0=domingo..6=sábado
  const diff = (5 - dow + 7) % 7;
  const viernes = new Date(d);
  viernes.setDate(viernes.getDate() + diff);
  return viernes.toISOString().slice(0, 10);
}

export default function CxP() {
  const [ordenes, setOrdenes] = useState<OrdenCxP[]>([]);
  const [transferencias, setTransferencias] = useState<TransferenciaNomina[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  // Pre-llenado de contexto desde una notificación (29-ago-2026): ?id=
  // resalta y hace scroll a la CxP correspondiente.
  const [searchParams] = useSearchParams();
  const idResaltado = searchParams.get("id");
  const refResaltada = useRef<HTMLTableRowElement>(null);

  function cargar() {
    setCargando(true);
    api
      .get<OrdenCxP[]>("/compras/cxp")
      .then(setOrdenes)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  useEffect(() => {
    api.get<TransferenciaNomina[]>(`/nomina/reporte/transferencias-viernes/${viernesDeEstaSemana()}`).then(setTransferencias);
  }, []);

  useEffect(() => {
    if (idResaltado) refResaltada.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [idResaltado, ordenes]);

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

      {transferencias.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Transferencias de Nómina — este viernes ({viernesDeEstaSemana()})</div>
          <table>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Banco</th>
                <th>Cuenta / CLABE</th>
                <th>Titular</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {transferencias.map((t) => (
                <tr key={t.personalId}>
                  <td>{t.nombreCompleto}</td>
                  <td>{t.banco ?? "—"}</td>
                  <td>{t.numeroCuentaOClabe ?? "—"}</td>
                  <td>{t.titularCuenta ?? "—"}</td>
                  <td>{formatearDinero(t.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
              <tr
                key={o.id}
                ref={o.id === idResaltado ? refResaltada : undefined}
                style={{
                  ...(o.alertaVisible ? { background: "var(--pink-soft, #fdeef1)" } : {}),
                  ...(o.id === idResaltado ? { outline: "2px solid var(--pink)" } : {}),
                }}
              >
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
