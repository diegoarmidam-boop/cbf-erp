import { useState } from "react";
import { ApiError } from "../lib/api";
import type { ZonaFlete } from "../lib/types";

interface ZonaForm {
  nombre: string;
  costoFleteKg: string;
  esZonaComprador: boolean;
}

function zonaFormVacio(): ZonaForm {
  return { nombre: "", costoFleteKg: "", esZonaComprador: false };
}

/**
 * Lista administrable de Zonas y flete (Prioridad 2, 3-sep-2026) — vive en
 * Proveedores porque desde esta prioridad la Zona también se captura ahí
 * (antes solo existía el alta rápida "+ Nueva Zona" dentro del Comparador,
 * ver GestorZonas en Comparador.tsx, que sigue igual para cotizar al vuelo).
 * Aquí sí se puede editar nombre/flete/bandera de zona-comprador y
 * activar/desactivar cualquier Zona ya creada.
 */
export default function ZonasPanel({
  zonas,
  cargando,
  crear,
  editar,
  actualizarActivo,
}: {
  zonas: ZonaFlete[];
  cargando: boolean;
  crear: (nombre: string, costoFleteKg: number, esZonaComprador?: boolean) => Promise<unknown>;
  editar: (id: string, cambios: Partial<{ nombre: string; costoFleteKg: number; esZonaComprador: boolean }>) => Promise<unknown>;
  actualizarActivo: (id: string, activo: boolean) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<ZonaForm>(zonaFormVacio());
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdit, setFormEdit] = useState<ZonaForm>(zonaFormVacio());

  async function crearZona() {
    setError(null);
    if (!form.nombre.trim() || (!form.esZonaComprador && !form.costoFleteKg)) return;
    try {
      await crear(form.nombre.trim(), Number(form.costoFleteKg || 0), form.esZonaComprador);
      setForm(zonaFormVacio());
      setMostrarForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la Zona.");
    }
  }

  function iniciarEdicion(z: ZonaFlete) {
    setEditandoId(z.id);
    setFormEdit({ nombre: z.nombre, costoFleteKg: String(z.costoFleteKg), esZonaComprador: z.esZonaComprador });
    setError(null);
  }

  async function guardarEdicion(id: string) {
    setError(null);
    if (!formEdit.nombre.trim() || (!formEdit.esZonaComprador && !formEdit.costoFleteKg)) return;
    try {
      await editar(id, {
        nombre: formEdit.nombre.trim(),
        costoFleteKg: formEdit.esZonaComprador ? 0 : Number(formEdit.costoFleteKg || 0),
        esZonaComprador: formEdit.esZonaComprador,
      });
      setEditandoId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  async function alternarActivo(z: ZonaFlete) {
    setError(null);
    try {
      await actualizarActivo(z.id, !z.activo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar.");
    }
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Zonas (flete)</div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (mostrarForm) setForm(zonaFormVacio());
            setMostrarForm((v) => !v);
          }}
        >
          {mostrarForm ? "Cancelar" : "+ Nueva Zona"}
        </button>
      </div>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 10 }}>{error}</div>}

      {mostrarForm && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14, borderBottom: "1px solid var(--border)", paddingBottom: 14 }}>
          <label className="field">
            Nombre de Zona
            <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="ej. Yucatán" style={{ width: 140 }} />
          </label>
          <label className="field" style={{ display: "flex", alignItems: "center", flexDirection: "row", gap: 4 }}>
            <input type="checkbox" checked={form.esZonaComprador} onChange={(e) => setForm((f) => ({ ...f, esZonaComprador: e.target.checked }))} />
            Es la Zona del comprador
          </label>
          {!form.esZonaComprador && (
            <label className="field">
              Flete $/kg
              <input type="number" min={0} step="0.01" value={form.costoFleteKg} onChange={(e) => setForm((f) => ({ ...f, costoFleteKg: e.target.value }))} style={{ width: 100 }} />
            </label>
          )}
          <button type="button" className="btn-primary" onClick={crearZona}>
            Crear
          </button>
        </div>
      )}

      {cargando ? (
        <p>Cargando…</p>
      ) : zonas.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Sin Zonas todavía.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Flete $/kg</th>
              <th>Zona del comprador</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {zonas.map((z) => (
              <tr key={z.id}>
                {editandoId === z.id ? (
                  <>
                    <td>
                      <input value={formEdit.nombre} onChange={(e) => setFormEdit((f) => ({ ...f, nombre: e.target.value }))} style={{ width: 120 }} autoFocus />
                    </td>
                    <td>
                      {formEdit.esZonaComprador ? (
                        "$0.00"
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={formEdit.costoFleteKg}
                          onChange={(e) => setFormEdit((f) => ({ ...f, costoFleteKg: e.target.value }))}
                          style={{ width: 80 }}
                        />
                      )}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={formEdit.esZonaComprador}
                        onChange={(e) => setFormEdit((f) => ({ ...f, esZonaComprador: e.target.checked }))}
                      />
                    </td>
                    <td>
                      <span className={`tag ${z.activo ? "tag-success" : "tag-danger"}`}>{z.activo ? "Activa" : "Inactiva"}</span>
                    </td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button className="btn-secondary" onClick={() => guardarEdicion(z.id)}>
                        Guardar
                      </button>
                      <button className="btn-secondary" onClick={() => setEditandoId(null)}>
                        Cancelar
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{z.nombre}</td>
                    <td>${Number(z.costoFleteKg).toFixed(2)}</td>
                    <td>{z.esZonaComprador ? "Sí" : "—"}</td>
                    <td>
                      <span className={`tag ${z.activo ? "tag-success" : "tag-danger"}`}>{z.activo ? "Activa" : "Inactiva"}</span>
                    </td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button className="btn-secondary" onClick={() => iniciarEdicion(z)}>
                        Editar
                      </button>
                      <button className="btn-secondary" onClick={() => alternarActivo(z)}>
                        {z.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
