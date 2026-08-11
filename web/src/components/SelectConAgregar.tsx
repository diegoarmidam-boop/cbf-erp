import { useState } from "react";
import type { CatalogoAbiertoItem } from "../lib/types";

interface Props {
  label: string;
  value: string;
  onChange: (nombre: string) => void;
  items: CatalogoAbiertoItem[];
  onAgregar: (nombre: string) => Promise<unknown>;
  required?: boolean;
  placeholder?: string;
}

/** Select de un catálogo abierto (Categoría/Ingrediente Activo/Contenedor/...) con botón "+" para agregar un valor nuevo sin salir del formulario. */
export default function SelectConAgregar({ label, value, onChange, items, onAgregar, required, placeholder }: Props) {
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function guardarNuevo() {
    if (!nuevoNombre.trim()) return;
    setError(null);
    try {
      await onAgregar(nuevoNombre.trim());
      onChange(nuevoNombre.trim());
      setNuevoNombre("");
      setMostrarNuevo(false);
    } catch {
      setError("No se pudo agregar.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label className="field">
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
          <option value="">{placeholder ?? "Selecciona…"}</option>
          {items.map((it) => (
            <option key={it.id} value={it.nombre}>
              {it.nombre}
            </option>
          ))}
        </select>
      </label>
      {!mostrarNuevo ? (
        <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setMostrarNuevo(true)}>
          + Nuevo
        </button>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ width: 120 }}
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nombre…"
            autoFocus
          />
          <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }} onClick={guardarNuevo}>
            Guardar
          </button>
          <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setMostrarNuevo(false)}>
            Cancelar
          </button>
        </div>
      )}
      {error && <span style={{ fontSize: 10.5, color: "var(--danger, #c0392b)" }}>{error}</span>}
    </div>
  );
}
