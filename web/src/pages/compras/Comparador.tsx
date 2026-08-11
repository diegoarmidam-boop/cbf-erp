import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useProductos } from "../../lib/useProductos";
import type { ComparacionCalculada, ComparacionResumen, Proveedor } from "../../lib/types";
import { formatearFecha } from "../../lib/fecha";

interface CotizacionForm {
  proveedorId: string;
  precioPresentacion: string;
  cantidadPresentacion: string;
  unidadPresentacion: string;
}

interface ItemForm {
  productoId: string;
  cantidadNecesaria: string;
  unidad: string;
  cotizaciones: CotizacionForm[];
}

function nuevaCotizacion(): CotizacionForm {
  return { proveedorId: "", precioPresentacion: "", cantidadPresentacion: "", unidadPresentacion: "" };
}

function nuevoItem(): ItemForm {
  return { productoId: "", cantidadNecesaria: "", unidad: "", cotizaciones: [nuevaCotizacion()] };
}

export default function Comparador() {
  const { productos } = useProductos();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [comparaciones, setComparaciones] = useState<ComparacionResumen[]>([]);
  const [detalle, setDetalle] = useState<ComparacionCalculada | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [items, setItems] = useState<ItemForm[]>([nuevoItem()]);

  function cargar() {
    api.get<ComparacionResumen[]>("/compras/comparador").then(setComparaciones);
    api.get<Proveedor[]>("/compras/proveedores").then(setProveedores);
  }

  useEffect(cargar, []);

  function verDetalle(id: string) {
    setError(null);
    api
      .get<ComparacionCalculada>(`/compras/comparador/${id}`)
      .then(setDetalle)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  async function eliminar(id: string) {
    if (!confirm("¿Borrar esta comparación?")) return;
    setError(null);
    try {
      await api.delete(`/compras/comparador/${id}`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar.");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        nombre: nombre || undefined,
        items: items.map((it) => ({
          productoId: it.productoId,
          cantidadNecesaria: Number(it.cantidadNecesaria),
          unidad: it.unidad,
          cotizaciones: it.cotizaciones.map((c) => ({
            proveedorId: c.proveedorId,
            precioPresentacion: Number(c.precioPresentacion),
            cantidadPresentacion: Number(c.cantidadPresentacion),
            unidadPresentacion: c.unidadPresentacion,
          })),
        })),
      };
      const nueva = await api.post<{ id: string }>("/compras/comparador", payload);
      setNombre("");
      setItems([nuevoItem()]);
      setMostrarForm(false);
      cargar();
      verDetalle(nueva.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la comparación.");
    }
  }

  function actualizarItem(i: number, campo: keyof ItemForm, valor: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  }

  function actualizarCotizacion(i: number, j: number, campo: keyof CotizacionForm, valor: string) {
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === i ? { ...it, cotizaciones: it.cotizaciones.map((c, cj) => (cj === j ? { ...c, [campo]: valor } : c)) } : it
      )
    );
  }

  if (detalle) {
    return (
      <div>
        <button className="btn-secondary" onClick={() => setDetalle(null)} style={{ marginBottom: 14 }}>
          ← Volver al Comparador
        </button>
        <h3 style={{ marginBottom: 4 }}>{detalle.nombre ?? "Comparación sin nombre"}</h3>
        <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 16 }}>{formatearFecha(detalle.fechaCreacion)}</div>

        {detalle.items.map((item) => (
          <div key={item.id} className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.producto.nombreComercial}</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
              Necesario: {item.cantidadNecesaria} {item.unidad}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Presentación</th>
                  <th>Precio presentación</th>
                  <th>Unidades a pedir</th>
                  <th>Cantidad comprada</th>
                  <th>Precio final</th>
                  <th>% aprovechamiento</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {item.cotizaciones.map((c) => (
                  <tr key={c.id} style={c.recomendado ? { background: "var(--pink-soft, #fdeef1)" } : undefined}>
                    <td>{c.proveedor.nombre}</td>
                    <td>
                      {c.cantidadPresentacion} {c.unidadPresentacion}
                    </td>
                    <td>${c.precioPresentacion.toFixed(2)}</td>
                    <td>{c.unidadesAPedir}</td>
                    <td>
                      {c.cantidadComprada} {c.unidadPresentacion}
                    </td>
                    <td>${c.precioFinal.toFixed(2)}</td>
                    <td>{c.porcentajeAprovechamiento.toFixed(1)}%</td>
                    <td>{c.recomendado && <span className="tag tag-success">Recomendado</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {item.recomendacion && (
              <div style={{ marginTop: 10, fontSize: 12.5 }}>
                Comprar a <strong>{item.recomendacion.proveedorNombre}</strong> — ahorro de ${item.recomendacion.ahorro.toFixed(2)} contra
                el promedio de los proveedores cotizados.
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
        Herramienta para comparar precios entre proveedores antes de generar la orden de compra formal — no genera órdenes, solo ayuda a
        decidir.
      </p>

      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Nueva comparación"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ marginBottom: 18 }}>
          <label className="field" style={{ maxWidth: 320, marginBottom: 12 }}>
            Nombre (opcional)
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Fertilizante ciclo agosto" />
          </label>

          {items.map((item, i) => (
            <div key={i} className="card" style={{ marginBottom: 12, background: "var(--surface-soft, #fafafa)" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
                <label className="field">
                  Producto
                  <select value={item.productoId} onChange={(e) => actualizarItem(i, "productoId", e.target.value)} required>
                    <option value="">Selecciona…</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombreComercial}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Cantidad necesaria
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    value={item.cantidadNecesaria}
                    onChange={(e) => actualizarItem(i, "cantidadNecesaria", e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  Unidad
                  <input value={item.unidad} onChange={(e) => actualizarItem(i, "unidad", e.target.value)} placeholder="L, kg…" required />
                </label>
                {items.length > 1 && (
                  <button type="button" className="btn-secondary" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>
                    Quitar producto
                  </button>
                )}
              </div>

              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 6 }}>Cotizaciones por proveedor</div>
              {item.cotizaciones.map((c, j) => (
                <div key={j} style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <select value={c.proveedorId} onChange={(e) => actualizarCotizacion(i, j, "proveedorId", e.target.value)} required>
                    <option value="">Proveedor…</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Precio presentación"
                    style={{ width: 130 }}
                    value={c.precioPresentacion}
                    onChange={(e) => actualizarCotizacion(i, j, "precioPresentacion", e.target.value)}
                    required
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    placeholder="Cantidad presentación"
                    style={{ width: 140 }}
                    value={c.cantidadPresentacion}
                    onChange={(e) => actualizarCotizacion(i, j, "cantidadPresentacion", e.target.value)}
                    required
                  />
                  <input
                    placeholder="Unidad"
                    style={{ width: 80 }}
                    value={c.unidadPresentacion}
                    onChange={(e) => actualizarCotizacion(i, j, "unidadPresentacion", e.target.value)}
                    required
                  />
                  {item.cotizaciones.length > 1 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        setItems((prev) =>
                          prev.map((it, idx) => (idx === i ? { ...it, cotizaciones: it.cotizaciones.filter((_, cj) => cj !== j) } : it))
                        )
                      }
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, cotizaciones: [...it.cotizaciones, nuevaCotizacion()] } : it)))
                }
              >
                + Otro proveedor
              </button>
            </div>
          ))}

          <button type="button" className="btn-secondary" onClick={() => setItems((prev) => [...prev, nuevoItem()])}>
            + Otro producto
          </button>

          <div style={{ marginTop: 14 }}>
            <button className="btn-primary" type="submit">
              Guardar comparación
            </button>
          </div>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Productos</th>
            <th>Fecha</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {comparaciones.map((c) => (
            <tr key={c.id}>
              <td>
                <button
                  type="button"
                  onClick={() => verDetalle(c.id)}
                  style={{ border: "none", background: "none", color: "var(--pink)", cursor: "pointer", padding: 0, font: "inherit", fontWeight: 600 }}
                >
                  {c.nombre ?? "Sin nombre"}
                </button>
              </td>
              <td>{c.items.map((it) => it.producto.nombreComercial).join(", ")}</td>
              <td>{formatearFecha(c.fechaCreacion)}</td>
              <td>
                <button className="btn-secondary" onClick={() => eliminar(c.id)}>
                  Borrar
                </button>
              </td>
            </tr>
          ))}
          {comparaciones.length === 0 && (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                Sin comparaciones guardadas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
