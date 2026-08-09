import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useProductos } from "../../lib/useProductos";

const CATEGORIAS = ["agroquimico", "fertilizante", "refaccion", "general"];
const UNIDADES = ["L", "kg", "g", "ml", "pieza", "bulto", "garrafa"];

export default function Catalogo() {
  const { productos, cargando, refetch } = useProductos();
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [categoria, setCategoria] = useState("agroquimico");
  const [ingredienteActivo, setIngredienteActivo] = useState("");
  const [nombreComercial, setNombreComercial] = useState("");
  const [presentacion, setPresentacion] = useState("");
  const [unidad, setUnidad] = useState("L");
  const [requiereLote, setRequiereLote] = useState(true);

  async function toggleActivo(p: { id: string; activo: boolean }) {
    setError(null);
    try {
      await api.patch(`/almacen/productos/${p.id}/activo`, { activo: !p.activo });
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar.");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    try {
      const r = await api.post<{ mensaje?: string }>("/almacen/productos", {
        categoria,
        ingredienteActivo: ingredienteActivo || undefined,
        nombreComercial,
        presentacion,
        unidad,
        requiereLote,
      });
      setMensaje(r.mensaje ?? "Producto autorizado y agregado al catálogo.");
      setNombreComercial("");
      setIngredienteActivo("");
      setPresentacion("");
      setMostrarForm(false);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Nuevo producto"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
          <label className="field">
            Categoría
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Ingrediente activo
            <input value={ingredienteActivo} onChange={(e) => setIngredienteActivo(e.target.value)} />
          </label>
          <label className="field">
            Nombre comercial
            <input value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} required />
          </label>
          <label className="field">
            Presentación
            <input value={presentacion} onChange={(e) => setPresentacion(e.target.value)} placeholder="Bidón 20 L" required />
          </label>
          <label className="field">
            Unidad
            <select value={unidad} onChange={(e) => setUnidad(e.target.value)}>
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={requiereLote} onChange={(e) => setRequiereLote(e.target.checked)} />
            Requiere lote/caducidad
          </label>
          <button className="btn-primary" type="submit">
            Guardar
          </button>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
      {mensaje && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{mensaje}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre comercial</th>
              <th>Ingrediente activo</th>
              <th>Categoría</th>
              <th>Presentación</th>
              <th>Autorizado</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id}>
                <td>{p.nombreComercial}</td>
                <td>{p.ingredienteActivo ?? "—"}</td>
                <td>{p.categoria}</td>
                <td>{p.presentacion}</td>
                <td>
                  <span className={`tag ${p.autorizado ? "tag-success" : "tag-warning"}`}>{p.autorizado ? "Sí" : "Pendiente"}</span>
                </td>
                <td>
                  <span className={`tag ${p.activo ? "tag-success" : "tag-danger"}`}>{p.activo ? "Activo" : "Inactivo"}</span>
                </td>
                <td>
                  <button className="btn-secondary" onClick={() => toggleActivo(p)}>
                    {p.activo ? "Desactivar" : "Reactivar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
