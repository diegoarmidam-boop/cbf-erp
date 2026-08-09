import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useProductos } from "../../lib/useProductos";
import type { MejorProveedor, OrdenCompra, Proveedor } from "../../lib/types";

const ETIQUETAS_ESTADO: Record<string, string> = {
  pendiente_autorizar: "Pendiente de autorizar",
  pendiente_cotizar: "Pendiente de cotizar",
  generada: "En camino",
  recibida: "Recibida",
  rechazada: "Rechazada",
};

function tagEstado(estado: string) {
  if (estado === "recibida") return "tag-success";
  if (estado === "rechazada") return "tag-danger";
  if (estado === "generada") return "tag-neutral";
  return "tag-warning";
}

export default function Ordenes() {
  const { productos } = useProductos(true);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [productoId, setProductoId] = useState("");
  const [cantidadSolicitada, setCantidadSolicitada] = useState("");

  const [cotizando, setCotizando] = useState<string | null>(null);
  const [proveedorId, setProveedorId] = useState("");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [fechaEsperada, setFechaEsperada] = useState("");
  const [mejores, setMejores] = useState<MejorProveedor[]>([]);

  const [recibiendo, setRecibiendo] = useState<string | null>(null);
  const [cantidadRecibida, setCantidadRecibida] = useState("");
  const [lote, setLote] = useState("");
  const [fechaCaducidad, setFechaCaducidad] = useState("");

  function cargar() {
    api
      .get<OrdenCompra[]>("/compras/ordenes")
      .then(setOrdenes)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
    api.get<Proveedor[]>("/compras/proveedores").then(setProveedores);
  }

  useEffect(cargar, []);

  async function crearOrden(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/compras/ordenes", { productoId, cantidadSolicitada: Number(cantidadSolicitada) });
      setProductoId("");
      setCantidadSolicitada("");
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la solicitud.");
    }
  }

  async function autorizar(id: string) {
    setError(null);
    try {
      await api.post(`/compras/ordenes/${id}/autorizar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo autorizar.");
    }
  }

  async function rechazar(id: string) {
    setError(null);
    try {
      await api.post(`/compras/ordenes/${id}/rechazar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo rechazar.");
    }
  }

  async function abrirCotizar(orden: OrdenCompra) {
    setCotizando(orden.id);
    setProveedorId("");
    setPrecioUnitario("");
    setFechaEsperada("");
    const r = await api.get<MejorProveedor[]>(`/compras/proveedores/mejores/${orden.productoId}`);
    setMejores(r);
  }

  async function confirmarCotizar(id: string) {
    setError(null);
    try {
      await api.post(`/compras/ordenes/${id}/cotizar`, {
        proveedorId,
        precioUnitario: Number(precioUnitario),
        fechaEsperada: fechaEsperada || undefined,
      });
      setCotizando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cotizar.");
    }
  }

  async function confirmarRecibir(id: string) {
    setError(null);
    try {
      await api.post(`/compras/ordenes/${id}/recibir`, {
        cantidadRecibida: Number(cantidadRecibida),
        lote: lote || undefined,
        fechaCaducidad: fechaCaducidad || undefined,
      });
      setRecibiendo(null);
      setCantidadRecibida("");
      setLote("");
      setFechaCaducidad("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo recibir.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Solicitar compra"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={crearOrden} className="card" style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 18 }}>
          <label className="field">
            Producto (autorizado)
            <select value={productoId} onChange={(e) => setProductoId(e.target.value)} required>
              <option value="">Selecciona…</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombreComercial} ({p.presentacion})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Cantidad
            <input type="number" step="0.001" value={cantidadSolicitada} onChange={(e) => setCantidadSolicitada(e.target.value)} required />
          </label>
          <button className="btn-primary" type="submit">
            Enviar solicitud
          </button>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {ordenes.map((o) => (
          <div key={o.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span className={`tag ${tagEstado(o.estado)}`}>{ETIQUETAS_ESTADO[o.estado]}</span>{" "}
                <span className="tag tag-neutral">{o.origen}</span>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
                  {o.producto.nombreComercial} — {o.cantidadSolicitada} {o.producto.unidad}
                </div>
                {o.proveedor && (
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {o.proveedor.nombre} · ${o.precioUnitario}/{o.producto.unidad}
                    {o.fechaEsperada && ` · esperada ${o.fechaEsperada.slice(0, 10)}`}
                  </div>
                )}
                {o.motivoRechazo && <div style={{ fontSize: 12, color: "var(--danger)" }}>Motivo: {o.motivoRechazo}</div>}
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                {o.estado === "pendiente_autorizar" && (
                  <>
                    <button className="btn-primary" onClick={() => autorizar(o.id)}>
                      Autorizar
                    </button>
                    <button className="btn-secondary" onClick={() => rechazar(o.id)}>
                      Rechazar
                    </button>
                  </>
                )}
                {o.estado === "pendiente_cotizar" && cotizando !== o.id && (
                  <button className="btn-primary" onClick={() => abrirCotizar(o)}>
                    Cotizar
                  </button>
                )}
                {o.estado === "generada" && recibiendo !== o.id && (
                  <button className="btn-primary" onClick={() => setRecibiendo(o.id)}>
                    Recibir
                  </button>
                )}
              </div>
            </div>

            {cotizando === o.id && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                {mejores.length > 0 && (
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 8 }}>
                    Mejores anteriores: {mejores.map((m) => `${m.proveedor.nombre} ($${m.precioUnitario})`).join(" · ")}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="field">
                    Proveedor
                    <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                      <option value="">Selecciona…</option>
                      {proveedores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Precio unitario
                    <input type="number" step="0.01" value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} />
                  </label>
                  <label className="field">
                    Fecha esperada
                    <input type="date" value={fechaEsperada} onChange={(e) => setFechaEsperada(e.target.value)} />
                  </label>
                  <button className="btn-primary" onClick={() => confirmarCotizar(o.id)}>
                    Formalizar orden
                  </button>
                </div>
              </div>
            )}

            {recibiendo === o.id && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="field">
                    Cantidad recibida
                    <input type="number" step="0.001" value={cantidadRecibida} onChange={(e) => setCantidadRecibida(e.target.value)} />
                  </label>
                  {o.producto.requiereLote && (
                    <>
                      <label className="field">
                        Lote
                        <input value={lote} onChange={(e) => setLote(e.target.value)} />
                      </label>
                      <label className="field">
                        Caducidad
                        <input type="date" value={fechaCaducidad} onChange={(e) => setFechaCaducidad(e.target.value)} />
                      </label>
                    </>
                  )}
                  <button className="btn-primary" onClick={() => confirmarRecibir(o.id)}>
                    Confirmar recepción
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
