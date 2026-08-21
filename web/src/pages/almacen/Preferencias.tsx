import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useCatalogoAbierto } from "../../lib/useCatalogoAbierto";
import { useProductos } from "../../lib/useProductos";
import type { PreferenciaIngredienteActivo } from "../../lib/types";
import { presentacionTexto } from "../../lib/producto";

const ROLES_PUEDEN_EDITAR = ["director_general", "encargado_sistemas", "gerente_tecnico_produccion"];

/**
 * Producto preferido y sustitutos autorizados por Ingrediente Activo
 * (9.15, 20-ago-2026): homologa qué marca se compra a nivel empresa — no
 * cambia el FIFO de consumo (sigue siendo por antigüedad). El candado real
 * de quién puede editar vive en el backend; este check de rol solo decide
 * si se muestran los controles o la vista de solo lectura.
 */
export default function Preferencias() {
  const { usuario } = useAuth();
  const puedeEditar = usuario ? ROLES_PUEDEN_EDITAR.includes(usuario.rol) : false;
  const { items: ingredientes, cargando: cargandoIngredientes } = useCatalogoAbierto("/almacen/ingredientes-activos");
  const { productos } = useProductos(true);

  const [seleccionado, setSeleccionado] = useState<string>("");
  const [preferencia, setPreferencia] = useState<PreferenciaIngredienteActivo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agregandoId, setAgregandoId] = useState("");

  function cargarPreferencia(id: string) {
    setCargando(true);
    setError(null);
    api
      .get<PreferenciaIngredienteActivo>(`/almacen/ingredientes-activos/${id}/preferencia`)
      .then(setPreferencia)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    if (seleccionado) cargarPreferencia(seleccionado);
    else setPreferencia(null);
  }, [seleccionado]);

  const productosDelIngrediente = preferencia
    ? productos.filter((p) => p.ingredienteActivo === preferencia.ingredienteActivoNombre && p.activo)
    : [];
  const productosDisponiblesComoSustituto = productosDelIngrediente.filter(
    (p) => p.id !== preferencia?.productoPreferido?.id && !preferencia?.sustitutos.some((s) => s.productoId === p.id)
  );

  async function cambiarPreferido(productoId: string) {
    if (!seleccionado) return;
    setError(null);
    try {
      await api.put(`/almacen/ingredientes-activos/${seleccionado}/preferencia/preferido`, { productoId: productoId || null });
      cargarPreferencia(seleccionado);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el preferido.");
    }
  }

  async function agregarSustituto() {
    if (!seleccionado || !agregandoId) return;
    setError(null);
    try {
      await api.post(`/almacen/ingredientes-activos/${seleccionado}/preferencia/sustitutos`, { productoId: agregandoId });
      setAgregandoId("");
      cargarPreferencia(seleccionado);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar.");
    }
  }

  async function quitarSustituto(sustitutoId: string) {
    if (!seleccionado) return;
    setError(null);
    try {
      await api.delete(`/almacen/ingredientes-activos/${seleccionado}/preferencia/sustitutos/${sustitutoId}`);
      cargarPreferencia(seleccionado);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo quitar.");
    }
  }

  async function moverSustituto(index: number, direccion: -1 | 1) {
    if (!seleccionado || !preferencia) return;
    const destino = index + direccion;
    if (destino < 0 || destino >= preferencia.sustitutos.length) return;
    const orden = [...preferencia.sustitutos];
    const [item] = orden.splice(index, 1);
    orden.splice(destino, 0, item);
    setError(null);
    try {
      await api.patch(`/almacen/ingredientes-activos/${seleccionado}/preferencia/sustitutos/reordenar`, {
        ordenDeIds: orden.map((s) => s.id),
      });
      cargarPreferencia(seleccionado);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reordenar.");
    }
  }

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div style={{ minWidth: 220, maxWidth: 280 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 8, color: "var(--ink-soft)" }}>Ingredientes Activos</div>
        {cargandoIngredientes ? (
          <p>Cargando…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {ingredientes.map((i) => (
              <button
                key={i.id}
                className={seleccionado === i.id ? "btn-primary" : "btn-secondary"}
                style={{ textAlign: "left", justifyContent: "flex-start" }}
                onClick={() => setSeleccionado(i.id)}
              >
                {i.nombre}
              </button>
            ))}
            {ingredientes.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Sin Ingredientes Activos todavía.</p>}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 280 }}>
        {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

        {!seleccionado && <p style={{ color: "var(--ink-soft)" }}>Elige un Ingrediente Activo para ver/editar su preferencia.</p>}

        {seleccionado && cargando && <p>Cargando…</p>}

        {seleccionado && !cargando && preferencia && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card">
              <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 8 }}>Producto preferido</div>
              {puedeEditar ? (
                <select
                  value={preferencia.productoPreferido?.id ?? ""}
                  onChange={(e) => cambiarPreferido(e.target.value)}
                  style={{ maxWidth: 360 }}
                >
                  <option value="">Sin preferido definido</option>
                  {productosDelIngrediente.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombreComercial} ({presentacionTexto(p)})
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize: 13 }}>
                  {preferencia.productoPreferido
                    ? `${preferencia.productoPreferido.nombreComercial} (${presentacionTexto(preferencia.productoPreferido)})`
                    : "Sin preferido definido."}
                </div>
              )}
            </div>

            <div className="card">
              <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 8 }}>
                Sustitutos autorizados — en orden de prioridad
              </div>
              {preferencia.sustitutos.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8 }}>Sin sustitutos autorizados todavía.</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: puedeEditar ? 12 : 0 }}>
                {preferencia.sustitutos.map((s, i) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="tag tag-neutral">{i + 1}</span>
                    <span style={{ fontSize: 13, flex: 1 }}>
                      {s.producto.nombreComercial} ({presentacionTexto(s.producto)})
                    </span>
                    {puedeEditar && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn-secondary" disabled={i === 0} onClick={() => moverSustituto(i, -1)}>
                          ↑
                        </button>
                        <button className="btn-secondary" disabled={i === preferencia.sustitutos.length - 1} onClick={() => moverSustituto(i, 1)}>
                          ↓
                        </button>
                        <button className="btn-secondary" onClick={() => quitarSustituto(s.id)}>
                          Quitar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {puedeEditar && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="field" style={{ minWidth: 220 }}>
                    Agregar sustituto
                    <select value={agregandoId} onChange={(e) => setAgregandoId(e.target.value)}>
                      <option value="">Selecciona…</option>
                      {productosDisponiblesComoSustituto.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombreComercial} ({presentacionTexto(p)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn-secondary" onClick={agregarSustituto} disabled={!agregandoId}>
                    + Agregar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
