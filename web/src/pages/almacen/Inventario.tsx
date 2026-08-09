import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useProductos } from "../../lib/useProductos";
import type { ProductoLote } from "../../lib/types";

export default function Inventario() {
  const { productos, cargando: cargandoProductos } = useProductos();
  const [productoId, setProductoId] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [lotes, setLotes] = useState<ProductoLote[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productoId && productos.length > 0) setProductoId(productos[0]!.id);
  }, [productos, productoId]);

  useEffect(() => {
    if (!productoId) return;
    api
      .get<{ total: number; lotes: ProductoLote[] }>(`/almacen/movimientos/${productoId}/stock`)
      .then((r) => {
        setTotal(r.total);
        setLotes(r.lotes);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }, [productoId]);

  if (cargandoProductos) return <p>Cargando…</p>;
  if (productos.length === 0) return <p style={{ color: "var(--ink-soft)" }}>No hay productos en el catálogo todavía.</p>;

  const producto = productos.find((p) => p.id === productoId);

  return (
    <div>
      <label className="field" style={{ marginBottom: 16, maxWidth: 320 }}>
        Producto
        <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombreComercial} ({p.presentacion})
            </option>
          ))}
        </select>
      </label>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px" }}>{error}</div>}

      {total != null && (
        <div className="kpi-card" style={{ maxWidth: 240, marginBottom: 16 }}>
          <div className="label">Stock disponible</div>
          <div className="value">
            {total} {producto?.unidad}
          </div>
        </div>
      )}

      {producto?.requiereLote && (
        <table>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Caducidad</th>
              <th>Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {lotes.map((l) => (
              <tr key={l.id}>
                <td>{l.lote}</td>
                <td>{l.fechaCaducidad?.slice(0, 10) ?? "—"}</td>
                <td>{l.cantidadActual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
