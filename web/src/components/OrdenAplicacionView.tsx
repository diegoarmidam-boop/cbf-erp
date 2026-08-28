import { getToken } from "../lib/api";
import { api } from "../lib/api";
import type { OrdenAplicacion } from "../lib/types";
import { formatearNumero } from "../lib/numero";

/**
 * Orden de Aplicación (9.7, 25-ago-2026): vista en pantalla del documento
 * para el Encargado de Fumigación — pensada para verse completa en una
 * sola captura de pantalla de celular (una columna, sin tablas anchas que
 * se corten). El PDF descargable (identidad Chula) es la versión para
 * imprimir/compartir; esta vista es la misma información, más rápida de
 * generar sin salir de la app.
 */
export default function OrdenAplicacionView({ aplicacionId, orden, onCerrar }: { aplicacionId: string; orden: OrdenAplicacion; onCerrar: () => void }) {
  const e = orden.encabezado;

  function descargarPdf() {
    const token = getToken();
    fetch(`${api.apiUrl}/aplicaciones/${aplicacionId}/orden.pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `orden-aplicacion-${e.loteHuerta}-${e.fechaProgramada}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  const filaEstilo = { display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 100, overflowY: "auto", padding: "24px 12px" }}>
      <div className="card" style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ color: "var(--pink)", margin: 0 }}>Orden de Aplicación</h3>
          <button className="btn-secondary" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 12 }}>
          Semana {e.semana.inicio} al {e.semana.fin}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={filaEstilo}>
            <span>Lote/Huerta</span>
            <strong>{e.loteHuerta}</strong>
          </div>
          <div style={filaEstilo}>
            <span>No. de aplicación</span>
            <strong>{e.numeroAplicacion}</strong>
          </div>
          <div style={filaEstilo}>
            <span>Fecha programada</span>
            <strong>{e.fechaProgramada}</strong>
          </div>
          <div style={filaEstilo}>
            <span>Capacidad tanque/bomba</span>
            <strong>{formatearNumero(e.capacidadTanque)} L</strong>
          </div>
          <div style={filaEstilo}>
            <span>Tipo de aplicación</span>
            <strong>{e.tipoAplicacion ?? "Sin especificar"}</strong>
          </div>
          <div style={filaEstilo}>
            <span>Hectáreas a aplicar</span>
            <strong>{formatearNumero(e.hectareasAAplicar)} ha</strong>
          </div>
          <div style={filaEstilo}>
            <span>Gasto de agua</span>
            <strong>{formatearNumero(e.gastoAguaLHa)} L/ha</strong>
          </div>
          <div style={filaEstilo}>
            <span>Volumen total de agua</span>
            <strong>{formatearNumero(e.volumenTotalAguaL)} L</strong>
          </div>
          <div style={filaEstilo}>
            <span>Tanques a preparar</span>
            <strong>{formatearNumero(e.tanquesAPreparar)}</strong>
          </div>
          <div style={filaEstilo}>
            <span>Plantas a tratar</span>
            <strong>{e.plantasATratar != null ? formatearNumero(Math.round(e.plantasATratar)) : "No disponible"}</strong>
          </div>
          <div style={filaEstilo}>
            <span>Productos en la mezcla</span>
            <strong>{formatearNumero(e.numeroProductos)}</strong>
          </div>
          <div style={filaEstilo}>
            <span>Equipo de aplicación</span>
            <strong>{e.equipoAplicacion}</strong>
          </div>
          <div style={{ ...filaEstilo, borderBottom: "none" }}>
            <span>Hectáreas por tanque</span>
            <strong>{formatearNumero(e.hectareasPorTanque)} ha</strong>
          </div>
        </div>

        <div style={{ background: "var(--pink)", color: "#fff", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
          {orden.resumenPreparar}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {orden.productos.map((p) => (
            <div key={p.numero} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                {p.numero}. {p.nombreComercial}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 6 }}>{p.ingredienteActivo}</div>
              <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                <span>
                  Dosis: {formatearNumero(p.dosisValor)} {p.unidadDosis}
                </span>
                <span>
                  Cantidad total para el lote: {formatearNumero(p.cantidadTotalLote.valor)} {p.cantidadTotalLote.unidad}
                </span>
                <span>
                  Cantidad por tanque completo: {formatearNumero(p.cantidadPorTanqueCompleto.valor)} {p.cantidadPorTanqueCompleto.unidad}
                </span>
                <span>
                  Cantidad último tanque: {formatearNumero(p.cantidadUltimoTanque.valor)} {p.cantidadUltimoTanque.unidad}
                </span>
              </div>
            </div>
          ))}
        </div>

        <button className="btn-primary" style={{ width: "100%" }} onClick={descargarPdf}>
          Descargar PDF
        </button>
      </div>
    </div>
  );
}
