import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, getToken } from "../../lib/api";
import { useProductos } from "../../lib/useProductos";
import { useCatalogoAbierto } from "../../lib/useCatalogoAbierto";
import { useHuertas } from "../../lib/useHuertas";
import type { EstadoLineaPendiente, GrupoPendienteProgramacion, OrdenCompra, PendienteIngredienteActivo, Producto } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha, formatearInstante } from "../../lib/fecha";
import { formatearDinero, formatearNumero } from "../../lib/numero";
import { presentacionTexto } from "../../lib/producto";

const ETIQUETAS_ESTADO: Record<string, string> = {
  pendiente_autorizar: "Pendiente de autorizar",
  pendiente_cotizar: "Pendiente de cotizar",
  generada: "En camino",
  recibida: "Recibida",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  cubierta: "Cubierta (compra parcial completa)",
};

function tagEstado(estado: string) {
  if (estado === "recibida") return "tag-success";
  if (estado === "rechazada" || estado === "cancelada") return "tag-danger";
  if (estado === "generada" || estado === "cubierta") return "tag-neutral";
  return "tag-warning";
}

const TIPO_PROGRAMACION_LABEL: Record<GrupoPendienteProgramacion["tipo"], string> = {
  aplicacion: "Aplicación",
  granular: "Fertilización Granular",
  fertirriego: "Fertirriego",
  manual: "Solicitud manual",
  desconocido: "Programación",
};

const ETIQUETAS_LINEA_PENDIENTE: Record<EstadoLineaPendiente, string> = {
  pendiente: "Pendiente",
  cotizado: "Cotizado",
  comprado_parcial: "Comprado parcial",
};

function tagLineaPendiente(estado: EstadoLineaPendiente) {
  if (estado === "comprado_parcial") return "tag-success";
  if (estado === "cotizado") return "tag-neutral";
  return "tag-warning";
}

/**
 * Compras (9.14) — "Cotizar" ahora vive en el Comparador de Cotizaciones
 * (2-sep-2026): esta pantalla ya no captura proveedor/precio directo, solo
 * manda para allá con el contexto de la orden. Las "cancelada"/"rechazada"
 * se ocultan por default (mismo criterio que Fertirriego/Granular/
 * Aplicaciones, 31-ago-2026) — siguen existiendo, solo se piden aparte.
 */
export default function Ordenes() {
  const navigate = useNavigate();
  const { productos } = useProductos(true);
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<"orden" | "ingrediente" | "programacion">("programacion");
  const [pendientesPorIngrediente, setPendientesPorIngrediente] = useState<PendienteIngredienteActivo[]>([]);
  const [pendientesPorProgramacion, setPendientesPorProgramacion] = useState<GrupoPendienteProgramacion[]>([]);
  const [tarjetasAbiertas, setTarjetasAbiertas] = useState<Set<string>>(new Set());
  const [mostrarCerradas, setMostrarCerradas] = useState(false);

  // Pre-llenado de contexto desde una notificación (29-ago-2026): ?id=
  // resalta y hace scroll a la orden correspondiente en vez de dejar al
  // usuario buscarla entre todas.
  const [searchParams] = useSearchParams();
  const idResaltado = searchParams.get("id");
  const refResaltada = useRef<HTMLDivElement>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [productoId, setProductoId] = useState("");
  const [cantidadSolicitada, setCantidadSolicitada] = useState("");

  // Destino (4.1, 2-sep-2026) — obligatorio en solicitudes manuales: un
  // Centro de Costo del catálogo abierto, o una Huerta específica.
  const centrosCosto = useCatalogoAbierto("/compras/centros-costo");
  const { huertas } = useHuertas();
  const [destinoTipo, setDestinoTipo] = useState<"" | "centro_costo" | "huerta">("");
  const [centroCostoId, setCentroCostoId] = useState("");
  const [huertaDestinoId, setHuertaDestinoId] = useState("");
  const [mostrarNuevoCentroCosto, setMostrarNuevoCentroCosto] = useState(false);
  const [nuevoCentroCostoNombre, setNuevoCentroCostoNombre] = useState("");

  const [recibiendo, setRecibiendo] = useState<string | null>(null);
  const [cantidadRecibida, setCantidadRecibida] = useState("");
  const [lote, setLote] = useState("");
  const [fechaCaducidad, setFechaCaducidad] = useState("");
  const [opcionesRecepcion, setOpcionesRecepcion] = useState<Producto[]>([]);
  const [productoRecibidoId, setProductoRecibidoId] = useState("");

  function cargar() {
    api
      .get<OrdenCompra[]>(`/compras/ordenes${mostrarCerradas ? "?incluirCerradas=true" : ""}`)
      .then(setOrdenes)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  useEffect(cargar, [mostrarCerradas]);

  useEffect(() => {
    if (vista === "ingrediente") {
      api.get<PendienteIngredienteActivo[]>("/compras/ordenes/pendientes-por-ingrediente-activo").then(setPendientesPorIngrediente);
    }
    if (vista === "programacion") {
      api.get<GrupoPendienteProgramacion[]>("/compras/ordenes/pendientes-por-programacion").then(setPendientesPorProgramacion);
    }
  }, [vista]);

  function alternarTarjeta(clave: string) {
    setTarjetasAbiertas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }

  useEffect(() => {
    if (idResaltado) refResaltada.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [idResaltado, ordenes]);

  async function crearOrden(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!destinoTipo || (destinoTipo === "centro_costo" && !centroCostoId) || (destinoTipo === "huerta" && !huertaDestinoId)) {
      setError("Elige un Destino para la solicitud.");
      return;
    }
    try {
      await api.post("/compras/ordenes", {
        productoId,
        cantidadSolicitada: Number(cantidadSolicitada),
        centroCostoId: destinoTipo === "centro_costo" ? centroCostoId : undefined,
        huertaDestinoId: destinoTipo === "huerta" ? huertaDestinoId : undefined,
      });
      setProductoId("");
      setCantidadSolicitada("");
      setDestinoTipo("");
      setCentroCostoId("");
      setHuertaDestinoId("");
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la solicitud.");
    }
  }

  async function guardarNuevoCentroCosto() {
    if (!nuevoCentroCostoNombre.trim()) return;
    try {
      const nuevo = await centrosCosto.agregar(nuevoCentroCostoNombre.trim());
      setCentroCostoId((nuevo as { id: string }).id);
      setNuevoCentroCostoNombre("");
      setMostrarNuevoCentroCosto(false);
    } catch {
      setError("No se pudo agregar el Centro de Costo.");
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

  function irACotizar(ordenId: string) {
    navigate(`/compras/comparador?ordenCompraId=${ordenId}`);
  }

  async function abrirRecibir(orden: OrdenCompra) {
    setRecibiendo(orden.id);
    setCantidadRecibida("");
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
        cantidadRecibida: Number(cantidadRecibida),
        lote: lote || undefined,
        fechaCaducidad: fechaCaducidad || undefined,
        productoRecibidoId,
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
      <div style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Solicitar compra"}
        </button>
        <div style={{ display: "flex", gap: 4 }}>
          <button className={vista === "programacion" ? "btn-primary" : "btn-secondary"} onClick={() => setVista("programacion")}>
            Por Programación
          </button>
          <button className={vista === "ingrediente" ? "btn-primary" : "btn-secondary"} onClick={() => setVista("ingrediente")}>
            Por Ingrediente Activo
          </button>
          <button className={vista === "orden" ? "btn-primary" : "btn-secondary"} onClick={() => setVista("orden")}>
            Por orden
          </button>
        </div>
        {vista === "orden" && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-soft)" }}>
            <input type="checkbox" checked={mostrarCerradas} onChange={(e) => setMostrarCerradas(e.target.checked)} />
            Mostrar canceladas/rechazadas
          </label>
        )}
      </div>

      {mostrarForm && (
        <form onSubmit={crearOrden} className="card" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 18 }}>
          <label className="field">
            Producto (autorizado)
            <select value={productoId} onChange={(e) => setProductoId(e.target.value)} required>
              <option value="">Selecciona…</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombreComercial} ({presentacionTexto(p)})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Cantidad
            <input type="number" step="0.001" value={cantidadSolicitada} onChange={(e) => setCantidadSolicitada(e.target.value)} required />
          </label>
          <label className="field">
            Destino
            <select
              value={destinoTipo}
              onChange={(e) => {
                setDestinoTipo(e.target.value as "" | "centro_costo" | "huerta");
                setCentroCostoId("");
                setHuertaDestinoId("");
              }}
              required
            >
              <option value="">Selecciona…</option>
              <option value="centro_costo">Centro de Costo</option>
              <option value="huerta">Huerta</option>
            </select>
          </label>
          {destinoTipo === "centro_costo" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="field">
                Centro de Costo
                <select value={centroCostoId} onChange={(e) => setCentroCostoId(e.target.value)} required>
                  <option value="">Selecciona…</option>
                  {centrosCosto.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              {!mostrarNuevoCentroCosto ? (
                <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setMostrarNuevoCentroCosto(true)}>
                  + Nuevo Centro de Costo
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    style={{ width: 140 }}
                    value={nuevoCentroCostoNombre}
                    onChange={(e) => setNuevoCentroCostoNombre(e.target.value)}
                    placeholder="Nombre…"
                    autoFocus
                  />
                  <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }} onClick={guardarNuevoCentroCosto}>
                    Guardar
                  </button>
                  <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setMostrarNuevoCentroCosto(false)}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
          {destinoTipo === "huerta" && (
            <label className="field">
              Huerta
              <select value={huertaDestinoId} onChange={(e) => setHuertaDestinoId(e.target.value)} required>
                <option value="">Selecciona…</option>
                {huertas.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="btn-primary" type="submit">
            Enviar solicitud
          </button>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {vista === "programacion" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
            Una tarjeta = una Aplicación/Fertirriego/Fertilización Granular completa con todos sus productos, o una solicitud manual —
            para cotizar/comprar todo lo que necesita un mismo evento de una sola vez. Coexiste con las otras dos vistas.
          </p>
          {pendientesPorProgramacion.map((g) => {
            const abierta = tarjetasAbiertas.has(g.clave);
            return (
              <div key={g.clave} className="card">
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, cursor: "pointer" }}
                  onClick={() => alternarTarjeta(g.clave)}
                >
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {TIPO_PROGRAMACION_LABEL[g.tipo]}
                    {g.huertaNombre && ` — ${g.huertaNombre}`}
                    {g.fechaInicio && g.fechaFin && (
                      <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>
                        {" "}
                        ({formatearFecha(g.fechaInicio)} – {formatearFecha(g.fechaFin)})
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {g.lineas.length} producto{g.lineas.length !== 1 ? "s" : ""} pendiente{g.lineas.length !== 1 ? "s" : ""} {abierta ? "▲" : "▼"}
                  </div>
                </div>
                {abierta && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                    {g.lineas.map((l) => (
                      <div key={l.ordenId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, gap: 8 }}>
                        <span>
                          {l.nombreComercial}
                          {l.ingredienteActivo && ` (${l.ingredienteActivo})`} — {formatearNumero(l.cantidadPendiente)} {l.unidad}{" "}
                          <span className={`tag ${tagLineaPendiente(l.estado)}`}>{ETIQUETAS_LINEA_PENDIENTE[l.estado]}</span>
                        </span>
                        {l.estadoOrden === "pendiente_cotizar" && (
                          <button className="btn-secondary" onClick={() => irACotizar(l.ordenId)}>
                            Cotizar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {pendientesPorProgramacion.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin nada pendiente por Programación.</p>}
        </div>
      ) : vista === "ingrediente" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
            Suma la cantidad pendiente de cada Ingrediente Activo entre todas las órdenes pendientes, sin importar de dónde vinieron —
            para comprar en volumen. No reemplaza la vista por orden, sirve para anticipar en vez de resolver una orden puntual.
          </p>
          {pendientesPorIngrediente.map((g) => (
            <div key={g.ingredienteActivo} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{g.ingredienteActivo}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {formatearNumero(g.cantidadPendiente)} {g.unidad} pendientes entre {g.ordenes.length} orden{g.ordenes.length !== 1 ? "es" : ""}
                </div>
              </div>
              {g.origenes.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                  {g.origenes
                    .map((o) => {
                      const cantidadTexto = `${formatearNumero(o.cantidad)} ${g.unidad}`;
                      if (o.esManual) return `${cantidadTexto} (Solicitud manual)`;
                      const partes = [o.huertaNombre, o.recetaNombre ? `Receta ${o.recetaNombre}` : null].filter(Boolean);
                      return `${cantidadTexto} (${partes.join(" — ")})`;
                    })
                    .join(", ")}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {g.ordenes.map((o) => (
                  <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                    <span>
                      {formatearNumero(o.cantidadPendiente)} {g.unidad} · <span className={`tag ${tagEstado(o.estado)}`}>{ETIQUETAS_ESTADO[o.estado] ?? o.estado}</span>
                    </span>
                    {o.estado === "pendiente_cotizar" && (
                      <button className="btn-secondary" onClick={() => irACotizar(o.id)}>
                        Cotizar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {pendientesPorIngrediente.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin nada pendiente por Ingrediente Activo.</p>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ordenes.map((o) => (
            <div
              key={o.id}
              ref={o.id === idResaltado ? refResaltada : undefined}
              className="card"
              style={o.id === idResaltado ? { outline: "2px solid var(--pink)", outlineOffset: 2 } : undefined}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                  <span className={`tag ${tagEstado(o.estado)}`}>{ETIQUETAS_ESTADO[o.estado]}</span>{" "}
                  <span className="tag tag-neutral">{o.origen}</span>
                  {o.numero != null && <span className="tag tag-neutral">Folio {o.numero}</span>}
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
                    {o.producto.nombreComercial} — {o.cantidadSolicitada} {o.producto.unidad}
                  </div>
                  {(o.centroCosto || o.huertaDestino) && (
                    <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Destino: {o.centroCosto?.nombre ?? o.huertaDestino?.nombre}</div>
                  )}
                  {o.proveedor && (
                    <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      {o.proveedor.nombre} · {formatearDinero(o.precioUnitario ?? 0)}/{o.producto.unidad}
                      {o.fechaEsperada && ` · esperada ${formatearFecha(o.fechaEsperada)}`}
                    </div>
                  )}
                  {o.motivoRechazo && <div style={{ fontSize: 12, color: "var(--danger)" }}>Motivo: {o.motivoRechazo}</div>}
                  {o.estado === "recibida" && o.recepciones.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      Recibido: {o.recepciones.map((r) => `${r.cantidadRecibida} ${o.producto.unidad} el ${formatearInstante(r.fechaRecepcion)}`).join(" · ")}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                  {o.estado === "pendiente_cotizar" && (
                    <button className="btn-primary" onClick={() => irACotizar(o.id)}>
                      Cotizar
                    </button>
                  )}
                  {o.estado === "generada" && recibiendo !== o.id && (
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
                    <label className="field">
                      Cantidad recibida
                      <input type="number" step="0.001" value={cantidadRecibida} onChange={(e) => setCantidadRecibida(e.target.value)} />
                    </label>
                    <label className="field" style={{ minWidth: 220 }}>
                      Producto que llegó de verdad
                      <select value={productoRecibidoId} onChange={(e) => setProductoRecibidoId(e.target.value)} required>
                        {opcionesRecepcion.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombreComercial} ({presentacionTexto(p)}){p.id === o.productoId ? " — pedido" : " — sustituto"}
                          </option>
                        ))}
                      </select>
                    </label>
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
                  </div>
                </div>
              )}
            </div>
          ))}
          {ordenes.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin órdenes de compra.</p>}
        </div>
      )}
    </div>
  );
}
