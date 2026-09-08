import { useState } from "react";

/**
 * Teclado numérico propio (Prioridad 7.1, 8-sep-2026, Bloque 11) — reemplaza
 * el teclado nativo del teléfono en toda captura de números nueva de aquí en
 * adelante. La "casilla" es un <button>, nunca un <input>, para que el
 * teclado nativo del celular jamás se dispare al tocarla — el teclado propio
 * (grande, tipo calculadora) se abre debajo, en la paleta clara de CBF.
 *
 * Por decisión de Diego (8-sep-2026): solo se usa en pantallas nuevas — no
 * se retocan los inputs numéricos ya existentes en el resto del sistema.
 */
export interface CampoNumericoProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  permiteDecimales?: boolean;
}

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

export default function CampoNumerico({ label, value, onChange, placeholder, permiteDecimales = true }: CampoNumericoProps) {
  const [abierto, setAbierto] = useState(false);

  function teclear(t: string) {
    if (t === "⌫") {
      onChange(value.length > 1 ? value.slice(0, -1) : "");
    } else if (t === ".") {
      if (permiteDecimales && !value.includes(".")) onChange((value || "0") + ".");
    } else {
      onChange(value === "0" ? t : value + t);
    }
  }

  return (
    <label className="field">
      {label}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        style={{
          textAlign: "left",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "8px 10px",
          fontSize: 16,
          fontFamily: "var(--font-body)",
          color: value ? "var(--ink)" : "var(--ink-faint)",
          cursor: "pointer",
        }}
      >
        {value || placeholder || "0"}
      </button>

      {abierto && (
        <div className="card" style={{ marginTop: 8, padding: 12, cursor: "default" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {TECLAS.map((t, i) =>
              t === "." && !permiteDecimales ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => teclear(t)}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: "16px 0",
                    fontSize: 19,
                    fontWeight: 700,
                    fontFamily: "var(--font-heading)",
                    color: "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  {t}
                </button>
              )
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => onChange("")}>
              Borrar
            </button>
            <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={() => setAbierto(false)}>
              Listo
            </button>
          </div>
        </div>
      )}
    </label>
  );
}
