import { useState } from "react";
import { ApiError } from "../lib/api";
import type { CatalogoAbiertoItem } from "../lib/types";

/**
 * Administración de un catálogo abierto simple {id, nombre, activo}
 * (Prioridad 6, 4-sep-2026, Configuración → Catálogos) — editar nombre o
 * desactivar/reactivar un valor ya existente. Agregar uno nuevo ("+") se
 * queda donde ya vive, en el módulo de uso — esto no lo duplica.
 */
export default function CatalogoSimpleManager({
  titulo,
  items,
  cargando,
  editar,
  actualizarActivo,
}: {
  titulo: string;
  items: CatalogoAbiertoItem[];
  cargando: boolean;
  editar: (id: string, nombre: string) => Promise<unknown>;
  actualizarActivo: (id: string, activo: boolean) => Promise<unknown>;
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");
  const [error, setError] = useState<string | null>(null);

  function iniciarEdicion(it: CatalogoAbiertoItem) {
    setEditandoId(it.id);
    setNombreEdit(it.nombre);
    setError(null);
  }

  async function guardar(id: string) {
    if (!nombreEdit.trim()) return;
    setError(null);
    try {
      await editar(id, nombreEdit.trim());
      setEditandoId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  async function alternar(it: CatalogoAbiertoItem) {
    setError(null);
    try {
      await actualizarActivo(it.id, !it.activo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar.");
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{titulo}</div>
      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 10 }}>{error}</div>}
      {cargando ? (
        <p>Cargando…</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Sin valores todavía.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>
                  {editandoId === it.id ? (
                    <input value={nombreEdit} onChange={(e) => setNombreEdit(e.target.value)} autoFocus style={{ width: 180 }} />
                  ) : (
                    it.nombre
                  )}
                </td>
                <td>
                  <span className={`tag ${it.activo ? "tag-success" : "tag-danger"}`}>{it.activo ? "Activo" : "Inactivo"}</span>
                </td>
                <td style={{ display: "flex", gap: 6 }}>
                  {editandoId === it.id ? (
                    <>
                      <button className="btn-secondary" onClick={() => guardar(it.id)}>
                        Guardar
                      </button>
                      <button className="btn-secondary" onClick={() => setEditandoId(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn-secondary" onClick={() => iniciarEdicion(it)}>
                        Editar
                      </button>
                      <button className="btn-secondary" onClick={() => alternar(it)}>
                        {it.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
