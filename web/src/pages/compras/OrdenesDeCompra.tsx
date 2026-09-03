import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type {
  GrupoPendienteProgramacion,
  LineaOrigenNecesidad,
  PendienteIngredienteActivo,
  Proveedor,
  VistaPreviaProveedor,
} from "../../lib/types";
import { formatearDinero, formatearNumero } from "../../lib/numero";
import { formatearFecha } from "../../lib/fecha";

type ModoEntrada = "" | "proveedor" | "programacion" | "producto";

interface Asignacion {
  cotizacionId: string;
  cantidad: number;
}

/**
 * Pestaña "Órdenes de Compra" (3-sep-2026, Prioridad 1) — el único lugar
 * donde de verdad se arma y genera una orden de compra real. 3 formas de
 * entrada (Por Proveedor / Por Orden [= por Programación completa,
 * decisión de Diego 3-sep-2026] / Por Producto), agrupación automática por
 * Proveedor resultante con vista previa, y tope estricto de Cantidad
 * disponible del Proveedor (sin repartir automático).
 */
export default function OrdenesDeCompra({ ordenCompraIdInicial }: { ordenCompraIdInicial?: string | null }) {
  const [modo, setModo] = useState<ModoEntrada>("");
  const [lineas, setLineas] = useState<LineaOrigenNecesidad[]>([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selectores de "a dónde entrar" por modo.
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorId, setProveedorId] = useState("");
  const [gruposProgramacion, setGruposProgramacion] = useState<GrupoPendienteProgramacion[]>([]);
  const [gruposProducto, setGruposProducto] = useState<PendienteIngredienteActivo[]>([]);
  const [objetivoProgramacion, setObjetivoProgramacion] = useState<GrupoPendienteProgramacion | null>(null);
  const [objetivoProducto, setObjetivoProducto] = useState<PendienteIngredienteActivo | null>(null);

  // Asignación: por necesidad (ordenCompraId), qué cotización y cuánto.
  const [asignaciones, setAsignaciones] = useState<Record<string, Asignacion>>({});

  const [vistaPrevia, setVistaPrevia] = useState<VistaPreviaProveedor[] | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  useEffect(() => {
    api.get<Proveedor[]>("/compras/proveedores").then(setProveedores);
    api.get<GrupoPendienteProgramacion[]>("/compras/ordenes/pendientes-por-programacion").then(setGruposProgramacion);
    api.get<PendienteIngredienteActivo[]>("/compras/ordenes/pendientes-por-ingrediente-activo").then(setGruposProducto);
  }, []);

  // Ruta rápida (1.1) — llegando desde "Cotizar"/"Generar orden de compra"
  // en Pendientes: ?ordenCompraId= resuelve automáticamente a qué
  // programación (o solicitud manual) pertenece y entra directo en modo
  // "Por Orden", sin que el usuario tenga que volver a buscarla.
  useEffect(() => {
    if (!ordenCompraIdInicial || gruposProgramacion.length === 0) return;
    const grupo = gruposProgramacion.find((g) => g.lineas.some((l) => l.ordenId === ordenCompraIdInicial));
    if (grupo) {
      setModo("programacion");
      setObjetivoProgramacion(grupo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenCompraIdInicial, gruposProgramacion]);

  function limpiarSeleccion() {
    setLineas([]);
    setAsignaciones({});
    setVistaPrevia(null);
    setMensajeExito(null);
    setError(null);
  }

  function cambiarModo(m: ModoEntrada) {
    setModo(m);
    setProveedorId("");
    setObjetivoProgramacion(null);
    setObjetivoProducto(null);
    limpiarSeleccion();
  }

  function cargarPorProveedor(id: string) {
    setProveedorId(id);
    limpiarSeleccion();
    if (!id) return;
    setCargandoLineas(true);
    api
      .get<LineaOrigenNecesidad[]>(`/compras/ordenes-generacion/por-proveedor/${id}`)
      .then(setLineas)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargandoLineas(false));
  }

  function cargarPorProgramacion(grupo: GrupoPendienteProgramacion) {
    setObjetivoProgramacion(grupo);
    limpiarSeleccion();
    setCargandoLineas(true);
    const params =
      grupo.tipo === "manual" ? `ordenCompraIdManual=${grupo.lineas[0]?.ordenId}` : `referenciaAplicacionId=${grupo.referenciaId}`;
    api
      .get<LineaOrigenNecesidad[]>(`/compras/ordenes-generacion/por-programacion?${params}`)
      .then(setLineas)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargandoLineas(false));
  }

  function cargarPorProducto(grupo: PendienteIngredienteActivo) {
    setObjetivoProducto(grupo);
    limpiarSeleccion();
    setCargandoLineas(true);
    api
      .get<LineaOrigenNecesidad[]>(`/compras/ordenes-generacion/por-producto/${encodeURIComponent(grupo.ingredienteActivo)}`)
      .then(setLineas)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargandoLineas(false));
  }

  function asignar(necesidad: LineaOrigenNecesidad, cotizacionId: string) {
    setVistaPrevia(null);
    setMensajeExito(null);
    if (!cotizacionId) {
      setAsignaciones((prev) => {
        const siguiente = { ...prev };
        delete siguiente[necesidad.ordenCompraId];
        return siguiente;
      });
      return;
    }
    setAsignaciones((prev) => ({ ...prev, [necesidad.ordenCompraId]: { cotizacionId, cantidad: necesidad.cantidadPendiente } }));
  }

  function cambiarCantidad(ordenCompraId: string, cantidad: number) {
    setVistaPrevia(null);
    setMensajeExito(null);
    setAsignaciones((prev) => (prev[ordenCompraId] ? { ...prev, [ordenCompraId]: { ...prev[ordenCompraId]!, cantidad } } : prev));
  }

  const asignacionesArray = Object.entries(asignaciones).map(([ordenCompraId, a]) => ({
    ordenCompraId,
    cotizacionId: a.cotizacionId,
    cantidad: a.cantidad,
  }));

  async function verVistaPrevia() {
    setError(null);
    setCargandoPreview(true);
    try {
      const preview = await api.post<VistaPreviaProveedor[]>("/compras/ordenes-generacion/vista-previa", { asignaciones: asignacionesArray });
      setVistaPrevia(preview);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo calcular la vista previa.");
      setVistaPrevia(null);
    } finally {
      setCargandoPreview(false);
    }
  }

  async function generar() {
    setError(null);
    setGenerando(true);
    try {
      await api.post("/compras/ordenes-generacion/generar", { asignaciones: asignacionesArray });
      setMensajeExito(
        `Generado${vistaPrevia && vistaPrevia.length !== 1 ? "s" : ""}: ${vistaPrevia?.length ?? 0} orden${vistaPrevia && vistaPrevia.length !== 1 ? "es" : ""} de compra (una por Proveedor). Descárgalas desde "En Camino".`
      );
      setAsignaciones({});
      setVistaPrevia(null);
      // Recarga las líneas de la selección actual — lo ya cubierto desaparece.
      if (modo === "proveedor" && proveedorId) cargarPorProveedor(proveedorId);
      else if (modo === "programacion" && objetivoProgramacion) cargarPorProgramacion(objetivoProgramacion);
      else if (modo === "producto" && objetivoProducto) cargarPorProducto(objetivoProducto);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar.");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
        El único lugar donde de verdad se arma y genera una orden de compra real, a partir de necesidades ya cotizadas. Asigna
        Proveedor producto por producto — si varias líneas terminan en el mismo Proveedor, se agrupan solas en una sola orden/PDF.
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <button className={modo === "proveedor" ? "btn-primary" : "btn-secondary"} onClick={() => cambiarModo("proveedor")}>
          Por Proveedor
        </button>
        <button className={modo === "programacion" ? "btn-primary" : "btn-secondary"} onClick={() => cambiarModo("programacion")}>
          Por Orden (programación completa)
        </button>
        <button className={modo === "producto" ? "btn-primary" : "btn-secondary"} onClick={() => cambiarModo("producto")}>
          Por Producto
        </button>
      </div>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
      {mensajeExito && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{mensajeExito}</div>}

      {modo === "proveedor" && (
        <label className="field" style={{ maxWidth: 320, marginBottom: 16 }}>
          Proveedor
          <select value={proveedorId} onChange={(e) => cargarPorProveedor(e.target.value)}>
            <option value="">Selecciona…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      {modo === "programacion" && !objetivoProgramacion && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Elige la programación (o solicitud manual) que quieres armar:</p>
          {gruposProgramacion.map((g) => (
            <button key={g.clave} className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => cargarPorProgramacion(g)}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {TIPO_LABEL[g.tipo] ?? g.tipo}
                {g.huertaNombre && ` — ${g.huertaNombre}`}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                {g.lineas.length} producto{g.lineas.length !== 1 ? "s" : ""} · {formatearFecha(g.fecha)}
              </div>
            </button>
          ))}
          {gruposProgramacion.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin programaciones pendientes.</p>}
        </div>
      )}
      {modo === "programacion" && objetivoProgramacion && (
        <div style={{ marginBottom: 16 }}>
          <button className="btn-secondary" onClick={() => { setObjetivoProgramacion(null); limpiarSeleccion(); }}>
            ← Elegir otra programación
          </button>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 8 }}>
            {TIPO_LABEL[objetivoProgramacion.tipo] ?? objetivoProgramacion.tipo}
            {objetivoProgramacion.huertaNombre && ` — ${objetivoProgramacion.huertaNombre}`}
          </div>
        </div>
      )}

      {modo === "producto" && !objetivoProducto && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Elige el producto/Ingrediente Activo:</p>
          {gruposProducto.map((g) => (
            <button key={g.ingredienteActivo} className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => cargarPorProducto(g)}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{g.ingredienteActivo}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                {formatearNumero(g.cantidadPendiente)} {g.unidad} pendientes entre {g.ordenes.length} orden{g.ordenes.length !== 1 ? "es" : ""}
              </div>
            </button>
          ))}
          {gruposProducto.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin productos pendientes.</p>}
        </div>
      )}
      {modo === "producto" && objetivoProducto && (
        <div style={{ marginBottom: 16 }}>
          <button className="btn-secondary" onClick={() => { setObjetivoProducto(null); limpiarSeleccion(); }}>
            ← Elegir otro producto
          </button>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 8 }}>{objetivoProducto.ingredienteActivo}</div>
        </div>
      )}

      {cargandoLineas && <p>Cargando…</p>}

      {!cargandoLineas && lineas.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          {lineas.map((l) => {
            const asignacion = asignaciones[l.ordenCompraId];
            return (
              <div key={l.ordenCompraId} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{l.nombreComercial}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      {l.origenLabel} · {l.fecha && formatearFecha(l.fecha)} · Pendiente: {formatearNumero(l.cantidadPendiente)} {l.unidad}
                    </div>
                  </div>
                </div>
                {l.cotizaciones.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Sin cotizaciones capturadas todavía para este producto.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th></th>
                          <th>Proveedor</th>
                          <th>Marca</th>
                          <th>Precio/unidad</th>
                          <th>Disponible</th>
                          <th>Ya usado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.cotizaciones.map((c) => (
                          <tr key={c.cotizacionId} style={asignacion?.cotizacionId === c.cotizacionId ? { background: "var(--pink-soft, #fdeef1)" } : undefined}>
                            <td>
                              <input
                                type="radio"
                                name={`cot-${l.ordenCompraId}`}
                                checked={asignacion?.cotizacionId === c.cotizacionId}
                                onChange={() => asignar(l, c.cotizacionId)}
                              />
                            </td>
                            <td>
                              {c.proveedorNombre}
                              {c.esPreferido && <span className="tag tag-success" style={{ marginLeft: 6 }}>Preferido</span>}
                              {c.esSustituto && <span className="tag tag-neutral" style={{ marginLeft: 6 }}>Sustituto</span>}
                            </td>
                            <td>{c.nombreComercial}</td>
                            <td>{formatearDinero(c.precioUnitarioMXN)}</td>
                            <td>{c.cantidadDisponibleTotal ? <span className="tag tag-neutral">Toda</span> : formatearNumero(c.cantidadDisponible ?? 0)}</td>
                            <td>{formatearNumero(c.cantidadYaUsada)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {asignacion && (
                  <label className="field" style={{ maxWidth: 200, marginTop: 8 }}>
                    Cantidad a comprarle a este Proveedor ({l.unidad})
                    <input
                      type="number"
                      min={0.001}
                      step="0.001"
                      value={asignacion.cantidad}
                      onChange={(e) => cambiarCantidad(l.ordenCompraId, Number(e.target.value))}
                    />
                  </label>
                )}
              </div>
            );
          })}
          {asignacionesArray.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-secondary" onClick={verVistaPrevia} disabled={cargandoPreview}>
                {cargandoPreview ? "Calculando…" : "Ver vista previa"}
              </button>
            </div>
          )}
        </div>
      )}

      {!cargandoLineas && modo && lineas.length === 0 && !error && (proveedorId || objetivoProgramacion || objetivoProducto) && (
        <p style={{ color: "var(--ink-soft)" }}>Sin necesidades pendientes cotizadas en esta selección.</p>
      )}

      {vistaPrevia && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>
            Esto va a generar {vistaPrevia.length} orden{vistaPrevia.length !== 1 ? "es" : ""} de compra:
          </div>
          {vistaPrevia.map((g) => (
            <div key={g.proveedorId} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 12.5 }}>{g.proveedorNombre}</div>
              <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: 12 }}>
                {g.lineas.map((l) => (
                  <li key={l.productoId}>
                    {l.nombreComercial} — {formatearNumero(l.cantidad)} {l.unidad} · {formatearDinero(l.importe)}
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Total: {formatearDinero(g.total)}</div>
            </div>
          ))}
          <button className="btn-primary" onClick={generar} disabled={generando}>
            {generando ? "Generando…" : "Generar"}
          </button>
        </div>
      )}
    </div>
  );
}

const TIPO_LABEL: Record<string, string> = {
  aplicacion: "Aplicación",
  granular: "Fertilización Granular",
  fertirriego: "Fertirriego",
  manual: "Solicitud manual",
  desconocido: "Programación",
};
