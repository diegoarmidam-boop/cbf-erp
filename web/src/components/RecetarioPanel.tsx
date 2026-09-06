import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCatalogoAbierto } from "../lib/useCatalogoAbierto";
import type { ConcentracionUnidad, IngredienteAutorizado, ModuloReceta, Receta } from "../lib/types";

export const ROLES_PUEDEN_RECETAS = ["director_general", "encargado_sistemas", "gerente_tecnico_produccion"];

// Ingrediente Activo, nunca marca (Prioridad 1, 3-sep-2026).
interface ProductoRecetaForm {
  ingredienteActivoNombre: string;
  concentracionValor: string;
  concentracionUnidad: ConcentracionUnidad;
}

function productoFormVacio(): ProductoRecetaForm {
  return { ingredienteActivoNombre: "", concentracionValor: "", concentracionUnidad: "ml_l" };
}

/**
 * Recetario (20-ago-2026): alta/edición/lista de recetas maestras, más el
 * catálogo abierto de Tipo de Aplicación — exclusivo de Aplicaciones (9.7)
 * desde la reversión de Fertirriego (27-ago-2026, ver Fertilizantes 9.5),
 * que ahora usa su propio componente (RecetarioFertirriegoPanel) y su
 * propio modelo de datos (dosis/ha, sin concentración ni Tipo de
 * aplicación). El prop `modulo` sigue existiendo por el tipo `Receta`
 * compartido con el backend, pero en la práctica solo se invoca con
 * "aplicaciones". El candado real de quién puede crear/editar vive en el
 * backend; aquí solo se ocultan los controles para el resto de roles.
 */
export default function RecetarioPanel({
  modulo,
  ingredientes,
  recetas,
  cargando,
  refetch,
}: {
  modulo: ModuloReceta;
  ingredientes: IngredienteAutorizado[];
  // Recetas/refetch vienen del padre (Aplicaciones), que ya llama
  // useRecetas para el selector "Usar receta" del formulario de Programar
  // — si este panel tuviera su propia instancia del hook, crear una
  // receta aquí no se reflejaría en ese selector hasta refrescar la
  // página entera (bug real, encontrado probando el flujo completo).
  recetas: Receta[];
  cargando: boolean;
  refetch: () => void;
}) {
  const { usuario } = useAuth();
  const puedeAdministrar = usuario ? ROLES_PUEDEN_RECETAS.includes(usuario.rol) : false;
  const { items: tiposAplicacion, agregar: agregarTipoAplicacion } = useCatalogoAbierto("/tipos-aplicacion");

  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [tipoAplicacionId, setTipoAplicacionId] = useState("");
  const [nuevoTipo, setNuevoTipo] = useState("");
  const [litrosPorHa, setLitrosPorHa] = useState("");
  const [productosForm, setProductosForm] = useState<ProductoRecetaForm[]>([productoFormVacio()]);

  function limpiarForm() {
    setEditandoId(null);
    setNombre("");
    setTipoAplicacionId("");
    setLitrosPorHa("");
    setProductosForm([productoFormVacio()]);
    setMostrarForm(false);
  }

  function iniciarEdicion(r: Receta) {
    setEditandoId(r.id);
    setNombre(r.nombre);
    setTipoAplicacionId(r.tipoAplicacionId ?? "");
    setLitrosPorHa(String(r.litrosPorHa));
    setProductosForm(
      r.productos.map((p) => ({
        ingredienteActivoNombre: p.producto.ingredienteActivo ?? "",
        concentracionValor: String(p.concentracionValor),
        concentracionUnidad: p.concentracionUnidad,
      }))
    );
    setError(null);
    setMostrarForm(true);
  }

  function actualizarProducto(index: number, cambios: Partial<ProductoRecetaForm>) {
    setProductosForm((prev) => prev.map((p, i) => (i !== index ? p : { ...p, ...cambios })));
  }

  function agregarProducto() {
    setProductosForm((prev) => [...prev, productoFormVacio()]);
  }

  function quitarProducto(index: number) {
    setProductosForm((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function agregarTipoNuevo() {
    if (!nuevoTipo.trim()) return;
    const creado = await agregarTipoAplicacion(nuevoTipo.trim());
    setTipoAplicacionId(creado.id);
    setNuevoTipo("");
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      nombre,
      modulo,
      tipoAplicacionId: tipoAplicacionId || undefined,
      litrosPorHa: Number(litrosPorHa),
      productos: productosForm.map((p) => ({
        ingredienteActivoNombre: p.ingredienteActivoNombre,
        concentracionValor: Number(p.concentracionValor),
        concentracionUnidad: p.concentracionUnidad,
      })),
    };
    try {
      if (editandoId) {
        await api.patch(`/recetario/${editandoId}`, payload);
      } else {
        await api.post("/recetario", payload);
      }
      limpiarForm();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la receta.");
    }
  }

  async function alternarActivo(r: Receta) {
    setError(null);
    try {
      await api.patch(`/recetario/${r.id}/activo`, { activo: !r.activo });
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
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="field">
              Nombre de la receta
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </label>
            <label className="field">
              Tipo de aplicación
              <select value={tipoAplicacionId} onChange={(e) => setTipoAplicacionId(e.target.value)}>
                <option value="">Sin especificar</option>
                {tiposAplicacion.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              + Tipo nuevo
              <div style={{ display: "flex", gap: 4 }}>
                <input value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} placeholder="ej. Foliar" style={{ width: 120 }} />
                <button type="button" className="btn-secondary" onClick={agregarTipoNuevo} disabled={!nuevoTipo.trim()}>
                  +
                </button>
              </div>
            </label>
            <label className="field">
              Litros de mezcla/agua por ha (un tanque para toda la receta)
              <input type="number" step="0.0001" value={litrosPorHa} onChange={(e) => setLitrosPorHa(e.target.value)} required />
            </label>
          </div>

          <div className="field">
            Productos de la receta
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {productosForm.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="field">
                    Ingrediente Activo
                    <select
                      value={p.ingredienteActivoNombre}
                      onChange={(e) => actualizarProducto(i, { ingredienteActivoNombre: e.target.value })}
                      required
                    >
                      <option value="">Selecciona…</option>
                      {ingredientes.map((ing) => (
                        <option key={ing.ingredienteActivoNombre} value={ing.ingredienteActivoNombre}>
                          {ing.ingredienteActivoNombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Concentración
                    <input
                      type="number"
                      step="0.0001"
                      style={{ width: 100 }}
                      value={p.concentracionValor}
                      onChange={(e) => actualizarProducto(i, { concentracionValor: e.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    Unidad
                    <select value={p.concentracionUnidad} onChange={(e) => actualizarProducto(i, { concentracionUnidad: e.target.value as ConcentracionUnidad })}>
                      <option value="ml_l">ml/L</option>
                      <option value="g_l">g/L</option>
                      <option value="kg_l">kg/L</option>
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
                {r.tipoAplicacion && <span className="tag tag-neutral">{r.tipoAplicacion.nombre}</span>}{" "}
                {!r.activo && <span className="tag tag-danger">Inactiva</span>}
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                  {r.productos.map((p) => `${p.producto.ingredienteActivo ?? p.producto.nombreComercial} (${p.concentracionValor} ${p.concentracionUnidad.replace("_", "/")})`).join(" + ")}
                  {" · "}
                  {r.litrosPorHa} L/ha
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
