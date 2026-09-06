import { useState } from "react";
import type { CategoriaProducto } from "../lib/types";

interface Props {
  value: string;
  onChange: (nombre: string) => void;
  items: CategoriaProducto[];
  onAgregar: (nombre: string, requiereIngredienteActivo: boolean) => Promise<unknown>;
  required?: boolean;
}

/**
 * Select de Categoría con botón "+" para agregar una nueva sin salir del
 * formulario (Prioridad 3, 4-sep-2026) — variante de SelectConAgregar con
 * el check "¿Requiere Ingrediente Activo?" que Diego decide al dar de alta
 * cada Categoría nueva (3.1). Editar el check de una Categoría ya
 * existente vive en Configuración → Catálogos (Prioridad 6 del mismo
 * prompt), no aquí.
 */
export default function SelectCategoriaConAgregar({ value, onChange, items, onAgregar, required }: Props) {
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [requiereIngredienteActivo, setRequiereIngredienteActivo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardarNuevo() {
    if (!nuevoNombre.trim()) return;
    setError(null);
    try {
      await onAgregar(nuevoNombre.trim(), requiereIngredienteActivo);
      onChange(nuevoNombre.trim());
      setNuevoNombre("");
      setRequiereIngredienteActivo(false);
      setMostrarNuevo(false);
    } catch {
      setError("No se pudo agregar.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label className="field">
        Categoría
        <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
          <option value="">Selecciona…</option>
          {items.map((it) => (
            <option key={it.id} value={it.nombre}>
              {it.nombre}
            </option>
          ))}
        </select>
      </label>
      {!mostrarNuevo ? (
        <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setMostrarNuevo(true)}>
          + Nueva
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
          <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Nombre de la Categoría…" autoFocus />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={requiereIngredienteActivo} onChange={(e) => setRequiereIngredienteActivo(e.target.checked)} />
            ¿Requiere Ingrediente Activo?
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }} onClick={guardarNuevo}>
              Guardar
            </button>
            <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setMostrarNuevo(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && <span style={{ fontSize: 10.5, color: "var(--danger, #c0392b)" }}>{error}</span>}
    </div>
  );
}
