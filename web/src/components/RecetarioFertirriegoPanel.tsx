import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { ModoDosisFertirriego, Producto, RecetaFertirriego } from "../lib/types";
import { presentacionTexto } from "../lib/producto";

export const ROLES_PUEDEN_RECETAS_FERTIRRIEGO = ["director_general", "encargado_sistemas", "gerente_tecnico_produccion"];

interface ProductoRecetaFertirriegoForm {
  productoId: string;
  dosisValor: string;
  dosisUnidad: ModoDosisFertirriego;
}

function productoFormVacio(): ProductoRecetaFertirriegoForm {
  return { productoId: "", dosisValor: "", dosisUnidad: "kg_ha" };
}

/**
 * Recetario de Fertirriego (27-ago-2026, reversión): componente propio,
 * separado de RecetarioPanel (Aplicaciones) — sin Tipo de aplicación, sin
 * litros de mezcla/agua por ha, solo nombre + productos con su dosis por
 * hectárea (kg/ha, L/ha o g/ha). Ver comentario completo en el schema,
 * FertirriegoProgramacion.
 */
export default function RecetarioFertirriegoPanel({
  productos,
  recetas,
  cargando,
  refetch,
}: {
  productos: Producto[];
  recetas: RecetaFertirriego[];
  cargando: boolean;
  refetch: () => void;
}) {
  const { usuario } = useAuth();
  const puedeAdministrar = usuario ? ROLES_PUEDEN_RECETAS_FERTIRRIEGO.includes(usuario.rol) : false;

  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [productosForm, setProductosForm] = useState<ProductoRecetaFertirriegoForm[]>([productoFormVacio()]);

  const productosDisponibles = productos.filter((p) => p.categoria === "fertilizante");

  function limpiarForm() {
    setEditandoId(null);
    setNombre("");
    setProductosForm([productoFormVacio()]);
    setMostrarForm(false);
  }

  function iniciarEdicion(r: RecetaFertirriego) {
    setEditandoId(r.id);
    setNombre(r.nombre);
    setProductosForm(r.productos.map((p) => ({ productoId: p.productoId, dosisValor: String(p.dosisValor), dosisUnidad: p.dosisUnidad })));
    setError(null);
    setMostrarForm(true);
  }

  function actualizarProducto(index: number, cambios: Partial<ProductoRecetaFertirriegoForm>) {
    setProductosForm((prev) => prev.map((p, i) => (i !== index ? p : { ...p, ...cambios })));
  }

  function agregarProducto() {
    setProductosForm((prev) => [...prev, productoFormVacio()]);
  }

  function quitarProducto(index: number) {
    setProductosForm((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      nombre,
      productos: productosForm.map((p) => ({ productoId: p.productoId, dosisValor: Number(p.dosisValor), dosisUnidad: p.dosisUnidad })),
    };
    try {
      if (editandoId) {
        await api.patch(`/fertilizantes/fertirriego/recetario/${editandoId}`, payload);
      } else {
        await api.post("/fertilizantes/fertirriego/recetario", payload);
      }
      limpiarForm();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la receta.");
    }
  }

  async function alternarActivo(r: RecetaFertirriego) {
    setError(null);
    try {
      await api.patch(`/fertilizantes/fertirriego/recetario/${r.id}/activo`, { activo: !r.activo });
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar.");
    }
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Recetario</div>
        {puedeAdministrar && (
          <button type="button" className="btn-secondary" onClick={() => (mostrarForm ? limpiarForm() : setMostrarForm(true))}>
            {mostrarForm ? "Cancelar" : "+ Nueva receta"}
          </button>
        )}
      </div>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 10 }}>{error}</div>}

      {mostrarForm && puedeAdministrar && (
        <form onSubmit={guardar} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 14 }}>
          <label className="field">
            Nombre de la receta
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>

          <div className="field">
            Productos de la receta (cada uno con su propia dosis por hectárea)
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {productosForm.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="field">
                    Producto
                    <select value={p.productoId} onChange={(e) => actualizarProducto(i, { productoId: e.target.value })} required>
                      <option value="">Selecciona…</option>
                      {productosDisponibles.map((prod) => (
                        <option key={prod.id} value={prod.id}>
                          {prod.nombreComercial} ({presentacionTexto(prod)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Dosis
                    <input
                      type="number"
                      step="0.0001"
                      style={{ width: 100 }}
                      value={p.dosisValor}
                      onChange={(e) => actualizarProducto(i, { dosisValor: e.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    Unidad
                    <select value={p.dosisUnidad} onChange={(e) => actualizarProducto(i, { dosisUnidad: e.target.value as ModoDosisFertirriego })}>
                      <option value="kg_ha">kg/ha</option>
                      <option value="l_ha">L/ha</option>
                      <option value="g_ha">g/ha</option>
                    </select>
                  </label>
                  {productosForm.length > 1 && (
                    <button type="button" className="btn-secondary" onClick={() => quitarProducto(i)}>
                      Quitar
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="btn-secondary" style={{ marginTop: 6, width: "fit-content" }} onClick={agregarProducto}>
              + Otro producto
            </button>
          </div>

          <button className="btn-primary" type="submit" style={{ width: "fit-content" }}>
            {editandoId ? "Guardar cambios" : "Crear receta"}
          </button>
        </form>
      )}

      {cargando ? (
        <p>Cargando…</p>
      ) : recetas.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Sin recetas todavía.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recetas.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{r.nombre}</span>{" "}
                {!r.activo && <span className="tag tag-danger">Inactiva</span>}
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                  {r.productos.map((p) => `${p.producto.nombreComercial} (${p.dosisValor} ${p.dosisUnidad.replace("_", "/")})`).join(" + ")}
                </div>
              </div>
              {puedeAdministrar && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn-secondary" onClick={() => iniciarEdicion(r)}>
                    Editar
                  </button>
                  <button className="btn-secondary" onClick={() => alternarActivo(r)}>
                    {r.activo ? "Desactivar" : "Reactivar"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
