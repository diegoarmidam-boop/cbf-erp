import { useState } from "react";

/**
 * Confirmación explícita en dos pasos (9.16, 31-ago-2026): regla universal
 * para cualquier acción de borrar/eliminar/cancelar/liberar en cualquier
 * módulo — un `window.confirm()` nativo (una sola interrupción) no cuenta
 * como "dos pasos". El primer paso es el botón que abre este modal (arma);
 * el segundo es el botón "Confirmar" de aquí adentro (ejecuta). Mismo
 * patrón que ya usaba "Confirmar semana" en Reporte de Nómina semanal,
 * ahora extraído a componente compartido.
 */
export default function ConfirmModal({
  titulo,
  mensaje,
  textoConfirmar = "Sí, confirmar",
  peligroso,
  onConfirmar,
  onCancelar,
}: {
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  peligroso?: boolean;
  onConfirmar: () => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  async function confirmar() {
    setProcesando(true);
    setError("");
    try {
      await onConfirmar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción.");
      setProcesando(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 12,
      }}
    >
      <div className="card" style={{ width: 380, maxWidth: "100%" }}>
        <h3 style={{ marginBottom: 10 }}>{titulo}</h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{mensaje}</p>
        {error && (
          <p style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 8 }}>{error}</p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn-secondary" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </button>
          <button className={peligroso ? "btn-danger" : "btn-primary"} onClick={confirmar} disabled={procesando}>
            {procesando ? "Procesando…" : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
