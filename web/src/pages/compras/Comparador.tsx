import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError, getToken } from "../../lib/api";
import { useZonas } from "../../lib/useZonas";
import type { ComparacionCalculada, ComparacionResumen, CotizacionCalculada, MonedaCotizacion, OrdenCompra, Proveedor } from "../../lib/types";
import { formatearInstante } from "../../lib/fecha";
import { formatearDinero, formatearNumero } from "../../lib/numero";
import ConfirmModal from "../../components/ConfirmModal";

interface CotizacionForm {
  proveedorId: string;
  zonaId: string;
  nombreComercial: string;
  moneda: MonedaCotizacion;
  precioValor: string;
  tipoCambio: string;
  presentacionCantidad: string;
}

function nuevaCotizacion(): CotizacionForm {
  return { proveedorId: "", zonaId: "", nombreComercial: "", moneda: "MXN", precioValor: "", tipoCambio: "", presentacionCantidad: "" };
}

function cotizacionAPayload(c: CotizacionForm) {
  return {
    proveedorId: c.proveedorId,
    zonaId: c.zonaId,
    nombreComercial: c.nombreComercial,
    moneda: c.moneda,
    precioValor: Number(c.precioValor),
    tipoCambio: c.moneda === "USD" ? Number(c.tipoCambio) : undefined,
    presentacionCantidad: Number(c.presentacionCantidad),
  };
}

const ETIQUETAS_ESTADO_ORDEN: Record<string, string> = {
  generada: "En camino",
  recibida: "Recibida",
  cancelada: "Cancelada",
};

/**
 * Comparador de Cotizaciones (9.14) — paso real de "Cotizar" del ciclo de
 * Compras desde el 2-sep-2026: ya no es una herramienta de análisis
 * aparte, cada Comparación está ligada a la OrdenCompra "necesidad" que
 * cotiza (ver Ordenes.tsx, botón "Cotizar"), y "Generar orden de compra"
 * aquí mismo produce la compra real (con folio y PDF).
 */
export default function Comparador() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { zonas, crear: crearZona } = useZonas();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [listaCompra, setListaCompra] = useState<OrdenCompra[]>([]);
  const [comparaciones, setComparaciones] = useState<ComparacionResumen[]>([]);
  const [detalle, setDetalle] = useState<ComparacionCalculada | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ordenId, setOrdenId] = useState("");
  const [umbralExcedentePct, setUmbralExcedentePct] = useState("20");
  const [cotizaciones, setCotizaciones] = useState<CotizacionForm[]>([nuevaCotizacion()]);

  // Agregar cotización a una comparación ya guardada (vista de detalle).
  const [agregandoCotizacion, setAgregandoCotizacion] = useState(false);
  const [cotizacionNueva, setCotizacionNueva] = useState<CotizacionForm>(nuevaCotizacion());
  const [confirmando, setConfirmando] = useState<{ tipo: "eliminarComparacion" | "borrarCotizacion"; id: string } | null>(null);

  // Generar orden de compra real (1.4) — cantidad editable para compra parcial.
  const [generandoOrdenPara, setGenerandoOrdenPara] = useState<string | null>(null);
  const [cantidadOrden, setCantidadOrden] = useState("");
  const [generandoOrden, setGenerandoOrden] = useState(false);

  function cargar() {
    api.get<ComparacionResumen[]>("/compras/comparador").then(setComparaciones);
    api.get<Proveedor[]>("/compras/proveedores").then(setProveedores);
    // "Lista de compra ya generada por el sistema" (1.1): órdenes ya
    // esperando cotización — de ahí se elige el Producto, sin volver a
    // capturar cantidad/unidad.
    api.get<OrdenCompra[]>("/compras/ordenes?estado=pendiente_cotizar").then(setListaCompra);
  }

  useEffect(cargar, []);

  function verDetalle(id: string) {
    setError(null);
    api
      .get<ComparacionCalculada>(`/compras/comparador/${id}`)
      .then(setDetalle)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  // Entrada desde "Cotizar" en Órdenes (Ordenes.tsx) con ?ordenCompraId= —
  // si ya hay una Comparación para esa orden, se abre directo; si no,
  // se precarga el formulario de nueva comparación con esa orden elegida.
  useEffect(() => {
    const ordenCompraId = searchParams.get("ordenCompraId");
    if (!ordenCompraId) return;
    api.get<ComparacionCalculada | null>(`/compras/comparador/por-orden/${ordenCompraId}`).then((existente) => {
      if (existente) {
        setDetalle(existente);
      } else {
        setOrdenId(ordenCompraId);
        setMostrarForm(true);
      }
    });
    // Se limpia el query param para no reabrir si el usuario navega "Volver".
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function eliminar(id: string) {
    setError(null);
    try {
      await api.delete(`/compras/comparador/${id}`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar.");
    }
  }

  function limpiarForm() {
    setMostrarForm(false);
    setOrdenId("");
    setUmbralExcedentePct("20");
    setCotizaciones([nuevaCotizacion()]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ordenId) {
      setError("Elige un producto de la lista de compra.");
      return;
    }
    try {
      const payload = {
        ordenCompraId: ordenId,
        umbralExcedentePct: Number(umbralExcedentePct),
        cotizaciones: cotizaciones.map(cotizacionAPayload),
      };
      const nueva = await api.post<{ id: string }>("/compras/comparador", payload);
      limpiarForm();
      cargar();
      verDetalle(nueva.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la comparación.");
    }
  }

  function actualizarCotizacion(j: number, cambios: Partial<CotizacionForm>) {
    setCotizaciones((prev) => prev.map((c, i) => (i === j ? { ...c, ...cambios } : c)));
  }

  async function enviarCotizacionNueva() {
    if (!detalle) return;
    setError(null);
    try {
      const actualizado = await api.post<ComparacionCalculada>(`/compras/comparador/${detalle.id}/cotizaciones`, {
        cotizaciones: [cotizacionAPayload(cotizacionNueva)],
      });
      setDetalle(actualizado);
      setCotizacionNueva(nuevaCotizacion());
      setAgregandoCotizacion(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar la cotización.");
    }
  }

  async function borrarCotizacion(cotizacionId: string) {
    if (!detalle) return;
    setError(null);
    try {
      await api.delete(`/compras/comparador/${detalle.id}/cotizaciones/${cotizacionId}`);
      verDetalle(detalle.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar.");
    }
  }

  async function confirmarGenerarOrden() {
    if (!detalle || !generandoOrdenPara) return;
    setError(null);
    setGenerandoOrden(true);
    try {
      await api.post(`/compras/comparador/${detalle.id}/generar-orden`, {
        cotizacionId: generandoOrdenPara,
        cantidad: Number(cantidadOrden),
      });
      setGenerandoOrdenPara(null);
      setCantidadOrden("");
      verDetalle(detalle.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar la orden.");
    } finally {
      setGenerandoOrden(false);
    }
  }

  function descargarPdfOrden(ordenGeneradaId: string, numero: number | null) {
    const token = getToken();
    fetch(`${api.apiUrl}/compras/ordenes/${ordenGeneradaId}/orden-compra.pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `orden-compra-${numero ?? ordenGeneradaId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  function filaCotizacion(c: CotizacionCalculada) {
    return (
      <tr
        key={c.id}
        style={
          c.esMejorGlobal
            ? { background: "var(--pink-soft, #fdeef1)" }
            : c.esMejorLocal
            ? { background: "var(--mod-nomina-bg, #e8f8ef)" }
            : undefined
        }
      >
        <td>
          {c.proveedor.nombre}
          {c.esMejorGlobal && <div style={{ fontSize: 10.5, color: "var(--pink)", fontWeight: 600 }}>(mejor precio)</div>}
        </td>
        <td>
          {c.zona.nombre} {c.zona.esZonaComprador && <span className="tag tag-neutral">Local</span>}
        </td>
        <td>{c.nombreComercial}</td>
        <td>
          {formatearDinero(c.precioValor)} {c.moneda}
          {c.moneda === "USD" && <div style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>≈ {formatearDinero(c.precioValorMXN)} MXN</div>}
        </td>
        <td>{c.presentacionCantidad}</td>
        <td>{formatearDinero(c.precioUnitarioMXN)}</td>
        <td>{c.unidadesAPedir}</td>
        <td>{c.cantidadComprada.toFixed(3)}</td>
        <td>
          {c.excedente.toFixed(3)} ({c.porcentajeExcedente.toFixed(1)}%)
          {c.alertaExcedente && <span className="tag tag-danger" style={{ marginLeft: 4 }}>REVISAR</span>}
        </td>
        <td>{formatearDinero(c.fleteTotal)}</td>
        <td style={{ fontWeight: 700 }}>{formatearDinero(c.totalConFlete)}</td>
        <td>
          {c.esMejorGlobal && <span className="tag tag-success">Mejor Global</span>}{" "}
          {c.esMejorLocal && !c.esMejorGlobal && <span className="tag tag-success">Mejor Local</span>}
        </td>
        <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {detalle && detalle.cantidadPendiente > 0 && (
            <button
              className="btn-primary"
              onClick={() => {
                setGenerandoOrdenPara(c.id);
                setCantidadOrden(String(detalle.cantidadPendiente));
              }}
            >
              Generar orden
            </button>
          )}
          <button className="btn-secondary" onClick={() => setConfirmando({ tipo: "borrarCotizacion", id: c.id })}>
            Borrar
          </button>
        </td>
      </tr>
    );
  }

  if (detalle) {
    const mejorGlobal = detalle.cotizaciones.find((c) => c.id === detalle.mejorGlobalId);
    const mejorLocal = detalle.cotizaciones.find((c) => c.id === detalle.mejorLocalId);
    return (
      <div>
        <button className="btn-secondary" onClick={() => setDetalle(null)} style={{ marginBottom: 14 }}>
          ← Volver al Comparador
        </button>
        <h3 style={{ marginBottom: 4 }}>{detalle.producto.nombreComercial}</h3>
        <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 16 }}>
          Necesario: {detalle.cantidadNecesaria} {detalle.unidad} · Umbral de excedente: {detalle.umbralExcedentePct}% · creada{" "}
          {formatearInstante(detalle.fechaCreacion)}
        </div>

        {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

        {/* Compra parcial (1.4): tarjeta de cuánto ya se compró y cuánto falta. */}
        <div className="card" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>Necesario</div>
            <div style={{ fontWeight: 700 }}>
              {formatearNumero(detalle.cantidadNecesaria)} {detalle.unidad}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>Ya comprado</div>
            <div style={{ fontWeight: 700, color: "var(--success)" }}>
              {formatearNumero(detalle.cantidadComprada)} {detalle.unidad}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>Pendiente</div>
            <div style={{ fontWeight: 700, color: detalle.cantidadPendiente > 0 ? "var(--pink)" : "var(--ink-soft)" }}>
              {formatearNumero(detalle.cantidadPendiente)} {detalle.unidad}
            </div>
          </div>
          {detalle.cantidadPendiente <= 0 && <span className="tag tag-success">Necesidad cubierta</span>}
        </div>

        {detalle.ordenesGeneradas.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Órdenes de compra generadas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {detalle.ordenesGeneradas.map((o) => (
                <div
                  key={o.id}
                  className="card"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 12px" }}
                >
                  <div style={{ fontSize: 12.5 }}>
                    <strong>{o.proveedorNombre}</strong> — {formatearNumero(o.cantidadSolicitada)} {detalle.unidad} ·{" "}
                    {o.precioUnitario != null ? formatearDinero(o.precioUnitario) : "—"}/{detalle.unidad}
                    {o.numero != null && <span className="tag tag-neutral" style={{ marginLeft: 8 }}>Folio {o.numero}</span>}
                    <span className={`tag ${o.estado === "cancelada" ? "tag-danger" : "tag-neutral"}`} style={{ marginLeft: 6 }}>
                      {ETIQUETAS_ESTADO_ORDEN[o.estado] ?? o.estado}
                    </span>
                  </div>
                  {o.numero != null && (
                    <button className="btn-secondary" onClick={() => descargarPdfOrden(o.id, o.numero)}>
                      Descargar PDF
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {detalle.cotizaciones.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Sin cotizaciones todavía.</p>
        ) : (
          <div style={{ overflowX: "auto", marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Zona</th>
                  <th>Nombre comercial</th>
                  <th>Precio presentación</th>
                  <th>Presentación</th>
                  <th>Precio/unidad</th>
                  <th>Unidades a pedir</th>
                  <th>Cantidad comprada</th>
                  <th>Excedente</th>
                  <th>Flete</th>
                  <th>Total con flete</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>{detalle.cotizaciones.map(filaCotizacion)}</tbody>
            </table>
          </div>
        )}

        {(mejorGlobal || mejorLocal) && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
            {mejorGlobal && (
              <div className="card" style={{ flex: "1 1 260px" }}>
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 4 }}>Mejor opción Global (con flete)</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{mejorGlobal.proveedor.nombre}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{mejorGlobal.zona.nombre}</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{formatearDinero(mejorGlobal.totalConFlete)}</div>
                {detalle.ahorroForaneo && !mejorGlobal.zona.esZonaComprador && (
                  <div style={{ fontSize: 12, color: "var(--success)", marginTop: 4 }}>
                    Ahorro vs. local: {formatearDinero(detalle.ahorroForaneo.monto)} ({detalle.ahorroForaneo.porcentaje.toFixed(1)}%)
                  </div>
                )}
              </div>
            )}
            {mejorLocal && (
              <div className="card" style={{ flex: "1 1 260px" }}>
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 4 }}>Mejor opción Local (sin flete)</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{mejorLocal.proveedor.nombre}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{mejorLocal.zona.nombre}</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{formatearDinero(mejorLocal.totalConFlete)}</div>
              </div>
            )}
            {!mejorLocal && (
              <div className="card" style={{ flex: "1 1 260px", color: "var(--ink-soft)", fontSize: 12.5 }}>
                Sin ninguna cotización capturada todavía en la Zona del comprador — no hay opción Local que comparar.
              </div>
            )}
          </div>
        )}

        {agregandoCotizacion ? (
          <div className="card" style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Nueva cotización</div>
            <GestorZonas crearZona={crearZona} />
            <LineaCotizacionForm
              c={cotizacionNueva}
              onChange={(cambios) => setCotizacionNueva((prev) => ({ ...prev, ...cambios }))}
              proveedores={proveedores}
              zonas={zonas}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn-secondary" onClick={() => setAgregandoCotizacion(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={enviarCotizacionNueva}>
                Agregar cotización
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-secondary" onClick={() => setAgregandoCotizacion(true)}>
            + Agregar cotización
          </button>
        )}

        {confirmando && confirmando.tipo === "borrarCotizacion" && (
          <ConfirmModal
            titulo="Borrar cotización"
            mensaje="¿Borrar esta cotización? Esto no se puede deshacer."
            peligroso
            onCancelar={() => setConfirmando(null)}
            onConfirmar={async () => {
              await borrarCotizacion(confirmando.id);
              setConfirmando(null);
            }}
          />
        )}

        {generandoOrdenPara && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div className="card" style={{ width: 360 }}>
              <h3 style={{ marginBottom: 10 }}>Generar orden de compra</h3>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>
                ¿Cuánto vas a comprarle a este Proveedor? Si no cubre todo lo pendiente, la necesidad se queda abierta por el resto —
                se puede seguir generando órdenes desde otras cotizaciones después.
              </p>
              <label className="field">
                Cantidad ({detalle.unidad}) — pendiente: {formatearNumero(detalle.cantidadPendiente)}
                <input
                  type="number"
                  min={0.001}
                  step="0.001"
                  max={detalle.cantidadPendiente}
                  value={cantidadOrden}
                  onChange={(e) => setCantidadOrden(e.target.value)}
                />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button className="btn-secondary" onClick={() => setGenerandoOrdenPara(null)} disabled={generandoOrden}>
                  Cancelar
                </button>
                <button className="btn-primary" onClick={confirmarGenerarOrden} disabled={generandoOrden || !cantidadOrden}>
                  {generandoOrden ? "Generando…" : "Generar orden"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
        Paso de "Cotizar" de Compras: compara precio + flete entre proveedores de distintas Zonas para un producto de la lista de
        compra, y genera la orden de compra real con el Proveedor que elijas — se puede comprar parcial, en más de un Proveedor.
      </p>

      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Nueva comparación"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ marginBottom: 18 }}>
          <label className="field" style={{ maxWidth: 420, marginBottom: 12 }}>
            Producto (de la lista de compra pendiente de cotizar)
            <select value={ordenId} onChange={(e) => setOrdenId(e.target.value)} required>
              <option value="">Selecciona…</option>
              {listaCompra.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.producto.nombreComercial} — {o.cantidadSolicitada} {o.producto.unidad}
                </option>
              ))}
            </select>
            {listaCompra.length === 0 && (
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
                No hay productos pendientes de cotizar en Órdenes ahora mismo.
              </div>
            )}
          </label>

          <label className="field" style={{ maxWidth: 220, marginBottom: 12 }}>
            Umbral de alerta % Excedente
            <input type="number" min={0} step="1" value={umbralExcedentePct} onChange={(e) => setUmbralExcedentePct(e.target.value)} required />
          </label>

          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 6 }}>Cotizaciones por proveedor</div>
          <GestorZonas crearZona={crearZona} />
          {cotizaciones.map((c, j) => (
            <div key={j} className="card" style={{ marginBottom: 10, background: "var(--surface-soft, #fafafa)" }}>
              <LineaCotizacionForm c={c} onChange={(cambios) => actualizarCotizacion(j, cambios)} proveedores={proveedores} zonas={zonas} />
              {cotizaciones.length > 1 && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ marginTop: 8 }}
                  onClick={() => setCotizaciones((prev) => prev.filter((_, i) => i !== j))}
                >
                  Quitar proveedor
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => setCotizaciones((prev) => [...prev, nuevaCotizacion()])}>
            + Otro proveedor
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
            <th>Producto</th>
            <th>Cantidad necesaria</th>
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
                  {c.producto.nombreComercial}
                </button>
              </td>
              <td>
                {c.cantidadNecesaria} {c.unidad}
              </td>
              <td>{formatearInstante(c.fechaCreacion)}</td>
              <td>
                <button className="btn-secondary" onClick={() => setConfirmando({ tipo: "eliminarComparacion", id: c.id })}>
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

      {confirmando && confirmando.tipo === "eliminarComparacion" && (
        <ConfirmModal
          titulo="Borrar comparación"
          mensaje="¿Borrar esta comparación? Esto no se puede deshacer."
          peligroso
          onCancelar={() => setConfirmando(null)}
          onConfirmar={async () => {
            await eliminar(confirmando.id);
            setConfirmando(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Catálogo abierto de Zonas (29-ago-2026) — un solo control por formulario,
 * NO uno por línea de cotización: antes vivía dentro de cada
 * LineaCotizacionForm y, al compartir el mismo estado entre todas las
 * líneas, crear una Zona nueva la auto-seleccionaba en la línea equivocada
 * si había más de un proveedor capturado a la vez (bug real, encontrado
 * probando el flujo completo con 2+ líneas). Aquí solo crea la Zona — el
 * usuario la elige manualmente en la línea que corresponda, como con
 * cualquier otro catálogo abierto del sistema.
 */
function GestorZonas({ crearZona }: { crearZona: (nombre: string, costoFleteKg: number, esZonaComprador?: boolean) => Promise<unknown> }) {
  const [mostrar, setMostrar] = useState(false);
  const [nombre, setNombre] = useState("");
  const [flete, setFlete] = useState("");
  const [esComprador, setEsComprador] = useState(false);

  async function crear() {
    if (!nombre.trim() || (!esComprador && !flete)) return;
    await crearZona(nombre.trim(), Number(flete || 0), esComprador);
    setNombre("");
    setFlete("");
    setEsComprador(false);
    setMostrar(false);
  }

  if (!mostrar) {
    return (
      <button type="button" className="btn-secondary" style={{ marginBottom: 10 }} onClick={() => setMostrar(true)}>
        + Nueva Zona
      </button>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
      <label className="field">
        Nombre de Zona
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Yucatán" style={{ width: 120 }} />
      </label>
      <label className="field" style={{ display: "flex", alignItems: "center", flexDirection: "row", gap: 4 }}>
        <input type="checkbox" checked={esComprador} onChange={(e) => setEsComprador(e.target.checked)} />
        Es la Zona del comprador
      </label>
      {!esComprador && (
        <label className="field">
          Flete $/kg
          <input type="number" min={0} step="0.01" value={flete} onChange={(e) => setFlete(e.target.value)} style={{ width: 90 }} />
        </label>
      )}
      <button type="button" className="btn-secondary" onClick={crear}>
        Crear
      </button>
      <button type="button" className="btn-secondary" onClick={() => setMostrar(false)}>
        Cancelar
      </button>
    </div>
  );
}

function LineaCotizacionForm({
  c,
  onChange,
  proveedores,
  zonas,
}: {
  c: CotizacionForm;
  onChange: (cambios: Partial<CotizacionForm>) => void;
  proveedores: Proveedor[];
  zonas: { id: string; nombre: string; esZonaComprador: boolean }[];
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label className="field">
        Proveedor
        <select value={c.proveedorId} onChange={(e) => onChange({ proveedorId: e.target.value })} required>
          <option value="">Selecciona…</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Zona
        <select value={c.zonaId} onChange={(e) => onChange({ zonaId: e.target.value })} required>
          <option value="">Selecciona…</option>
          {zonas.map((z) => (
            <option key={z.id} value={z.id}>
              {z.nombre}
              {z.esZonaComprador ? " (local)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Nombre comercial (de este proveedor)
        <input value={c.nombreComercial} onChange={(e) => onChange({ nombreComercial: e.target.value })} required style={{ width: 160 }} />
      </label>
      <label className="field">
        Moneda
        <select value={c.moneda} onChange={(e) => onChange({ moneda: e.target.value as MonedaCotizacion })}>
          <option value="MXN">MXN</option>
          <option value="USD">USD</option>
        </select>
      </label>
      <label className="field">
        Precio {c.moneda === "USD" ? "(USD)" : "(MXN)"}
        <input
          type="number"
          min={0}
          step="0.01"
          value={c.precioValor}
          onChange={(e) => onChange({ precioValor: e.target.value })}
          required
          style={{ width: 100 }}
        />
      </label>
      {c.moneda === "USD" && (
        <label className="field">
          Tipo de cambio
          <input
            type="number"
            min={0}
            step="0.0001"
            value={c.tipoCambio}
            onChange={(e) => onChange({ tipoCambio: e.target.value })}
            required
            style={{ width: 100 }}
          />
        </label>
      )}
      <label className="field">
        Presentación (tamaño del bulto)
        <input
          type="number"
          min={0}
          step="0.001"
          value={c.presentacionCantidad}
          onChange={(e) => onChange({ presentacionCantidad: e.target.value })}
          required
          style={{ width: 120 }}
        />
      </label>
    </div>
  );
}
