import { useEffect, useState } from "react";
import { api, ApiError, getToken } from "../../lib/api";
import { useCatalogoAbierto } from "../../lib/useCatalogoAbierto";
import type { OrdenCompra, Producto } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";
import { formatearNumero } from "../../lib/numero";
import { nombreConMarca } from "../../lib/producto";

/**
 * "En Camino" en Almacén (Prioridad 4, 3-sep-2026) — espejo de la pestaña
 * "En Camino" de Compras (9.14), para que Bodega sepa con anticipación qué
 * va a llegar. A diferencia de Compras, aquí SÍ se confirma la recepción
 * física (cantidad real, lote/caducidad) — Almacén Central es quien
 * físicamente recibe, ya no Compras (ver Ordenes.tsx: su pestaña
 * "Recibidas" pasó a ser de solo lectura). El backend de "recibir" ahora
 * exige el permiso almacen.capturar.
 */
export default function EnCamino() {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contenedores = useCatalogoAbierto("/almacen/contenedores");

  const [recibiendo, setRecibiendo] = useState<string | null>(null);
  // Presentación al recibir (Prioridad 2, 4-sep-2026) — "X Contenedores de Y
  // Cantidad", el total nunca se captura suelto, se calcula solo.
  const [contenedor, setContenedor] = useState("");
  const [presentacionCantidad, setPresentacionCantidad] = useState("");
  const [numeroUnidades, setNumeroUnidades] = useState("");
  const [lote, setLote] = useState("");
  const [fechaCaducidad, setFechaCaducidad] = useState("");
  const [productoRecibidoId, setProductoRecibidoId] = useState("");
  const [opcionesRecepcion, setOpcionesRecepcion] = useState<Producto[]>([]);

  const totalRecibido = Number(presentacionCantidad || 0) * Number(numeroUnidades || 0);

  function cargar() {
    setCargando(true);
    api
      .get<OrdenCompra[]>("/compras/ordenes/en-camino")
      .then(setOrdenes)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function abrirRecibir(orden: OrdenCompra) {
    setError(null);
    setRecibiendo(orden.id);
    setContenedor("");
    setPresentacionCantidad("");
    setNumeroUnidades("");
    setLote("");
    setFechaCaducidad("");
    setProductoRecibidoId(orden.productoId);
    const opciones = await api.get<Producto[]>(`/compras/ordenes/${orden.id}/opciones-recepcion`);
    setOpcionesRecepcion(opciones);
  }

  async function confirmarRecibir(id: string) {
    setError(null);
    try {
      await api.post(`/compras/ordenes/${id}/recibir`, {
        contenedor,
        presentacionCantidad: Number(presentacionCantidad),
        numeroUnidades: Number(numeroUnidades),
        lote: lote || undefined,
        fechaCaducidad: fechaCaducidad || undefined,
        productoRecibidoId,
      });
      setRecibiendo(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo recibir.");
    }
  }

  function descargarPdf(id: string, numero: number | null) {
    const token = getToken();
    fetch(`${api.apiUrl}/compras/ordenes/${id}/orden-compra.pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `orden-compra-${numero ?? id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
        Lo que ya se compró y viene en camino de un Proveedor. Cuando llegue físicamente a Almacén Central, confirma aquí la
        recepción (cantidad real, lote/caducidad si aplica) — Compras ve el resultado reflejado en su pestaña "Recibidas".
      </p>

      {error && (
        <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {cargando ? (
        <p>Cargando…</p>
      ) : ordenes.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>Sin órdenes en camino.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ordenes.map((o) => (
            <div key={o.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  {o.numero != null && <span className="tag tag-neutral">Folio {o.numero}</span>}
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
                    {o.producto.nombreComercial} — {o.cantidadSolicitada} {o.producto.unidad}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {o.proveedor?.nombre ?? "—"}
                    {o.fechaEsperada && ` · esperada ${formatearFecha(o.fechaEsperada)}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
                  {recibiendo !== o.id && (
                    <button className="btn-primary" onClick={() => abrirRecibir(o)}>
                      Recibir
                    </button>
                  )}
                  {o.numero != null && (
                    <button className="btn-secondary" onClick={() => descargarPdf(o.id, o.numero)}>
                      Descargar PDF
                    </button>
                  )}
                </div>
              </div>

              {recibiendo === o.id && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <label className="field" style={{ minWidth: 220 }}>
                      Producto que llegó de verdad
                      <select value={productoRecibidoId} onChange={(e) => setProductoRecibidoId(e.target.value)} required>
                        {opcionesRecepcion.map((p) => (
                          <option key={p.id} value={p.id}>
                            {nombreConMarca(p)}
                            {p.id === o.productoId ? " — pedido" : " — sustituto"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Contenedor
                      <select value={contenedor} onChange={(e) => setContenedor(e.target.value)} required>
                        <option value="">Selecciona…</option>
                        {contenedores.items.map((ct) => (
                          <option key={ct.id} value={ct.nombre}>
                            {ct.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Cantidad por contenedor ({o.producto.unidad})
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={presentacionCantidad}
                        onChange={(e) => setPresentacionCantidad(e.target.value)}
                        style={{ width: 140 }}
                      />
                    </label>
                    <label className="field">
                      Número de Contenedores
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={numeroUnidades}
                        onChange={(e) => setNumeroUnidades(e.target.value)}
                        style={{ width: 140 }}
                      />
                    </label>
                    <div style={{ fontSize: 12.5, fontWeight: 600, paddingBottom: 8 }}>
                      Total: {formatearNumero(totalRecibido)} {o.producto.unidad}
                    </div>
                    {o.producto.requiereLote && (
                      <>
                        <label className="field">
                          Lote
                          <input value={lote} onChange={(e) => setLote(e.target.value)} />
                        </label>
                        <label className="field">
                          Caducidad
                          <FechaInput value={fechaCaducidad} onChange={setFechaCaducidad} />
                        </label>
                      </>
                    )}
                    <button className="btn-primary" onClick={() => confirmarRecibir(o.id)}>
                      Confirmar recepción
                    </button>
                    <button className="btn-secondary" onClick={() => setRecibiendo(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
