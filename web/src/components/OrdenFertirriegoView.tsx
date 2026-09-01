import { api, getToken } from "../lib/api";
import type { OrdenFertirriego } from "../lib/types";
import { formatearNumero } from "../lib/numero";

/**
 * Orden de Fertirriego (9.5 Camino 2, 25-ago-2026): vista en pantalla para
 * el Encargado de Riego — mismo criterio que Orden de Aplicación (ver
 * OrdenAplicacionView), la tabla de válvulas × productos sí necesita
 * scroll horizontal propio si hay varios productos, pero nunca corta el
 * resto de la pantalla.
 */
export default function OrdenFertirriegoView({ fertirriegoId, orden, onCerrar }: { fertirriegoId: string; orden: OrdenFertirriego; onCerrar: () => void }) {
  const e = orden.encabezado;

  function descargarPdf() {
    const token = getToken();
    fetch(`${api.apiUrl}/fertilizantes/fertirriego/${fertirriegoId}/orden.pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `orden-fertirriego-${e.lote}-${e.fecha}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  const filaEstilo = { display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 100, overflowY: "auto", padding: "24px 12px" }}>
      <div className="card" style={{ width: "100%", maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ color: "var(--pink)", margin: 0 }}>Orden de Fertirriego</h3>
          <button className="btn-secondary" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 12 }}>
          Semana {e.semana.inicio} al {e.semana.fin}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={filaEstilo}>
            <span>Lote</span>
            <strong>{e.lote}</strong>
          </div>
          <div style={filaEstilo}>
            <span>Fecha</span>
            <strong>{e.fecha}</strong>
          </div>
          <div style={filaEstilo}>
            <span>Válvulas del lote</span>
            <strong>{formatearNumero(e.valvulasDelLote)}</strong>
          </div>
          <div style={filaEstilo}>
            <span>Receta</span>
            <strong>{e.receta ?? "Programación libre"}</strong>
          </div>
          <div style={filaEstilo}>
            <span>Frecuencia</span>
            <strong>{e.frecuencia}</strong>
          </div>
          <div style={filaEstilo}>
            <span>Riegos en la semana</span>
            <strong>{formatearNumero(e.riegosEnLaSemana)}</strong>
          </div>
          <div style={{ ...filaEstilo, borderBottom: "none" }}>
            <span>Hectáreas totales</span>
            <strong>{formatearNumero(e.hectareasTotales)} ha</strong>
          </div>
        </div>

        <div style={{ overflowX: "auto", marginBottom: 14 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--wine)", color: "#fff" }}>
                <th style={{ padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" }}>Válvula</th>
                <th style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>Hectáreas</th>
                {orden.productos.map((p) => (
                  <th key={p.productoId} style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {p.nombreComercial}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orden.valvulas.map((v, i) => (
                <tr key={v.seccionId} style={{ background: i % 2 === 1 ? "var(--bg)" : "transparent" }}>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{v.nombre}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{formatearNumero(v.hectareas)}</td>
                  {orden.productos.map((p) => {
                    const c = p.porValvula.find((pv) => pv.seccionId === v.seccionId)!.cantidad;
                    return (
                      <td key={p.productoId} style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {formatearNumero(c.valor)} {c.unidad}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Total por riego</td>
                <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{formatearNumero(e.hectareasTotales)}</td>
                {orden.productos.map((p) => (
                  <td key={p.productoId} style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {formatearNumero(p.totalPorRiego.valor)} {p.totalPorRiego.unidad}
                  </td>
                ))}
              </tr>
              <tr style={{ fontWeight: 700 }}>
                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Total de la semana</td>
                <td></td>
                {orden.productos.map((p) => (
                  <td key={p.productoId} style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {formatearNumero(p.totalSemana.valor)} {p.totalSemana.unidad}
                  </td>
                ))}
              </tr>
              <tr style={{ fontWeight: 700, color: "var(--pink)" }}>
                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Total de campaña (hasta {e.fechaFinCampania})</td>
                <td></td>
                {orden.productos.map((p) => (
                  <td key={p.productoId} style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {formatearNumero(p.totalCampania.valor)} {p.totalCampania.unidad}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <button className="btn-primary" style={{ width: "100%" }} onClick={descargarPdf}>
          Descargar PDF
        </button>
      </div>
    </div>
  );
}
