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
import { nombreConMarca } from "../../lib/producto";
import OrdenesDeCompra from "./OrdenesDeCompra";

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

type TabPrincipal = "pendientes" | "ordenes_de_compra" | "en_camino" | "recibidas" | "rechazadas_canceladas";
type SubvistaPendientes = "programacion" | "producto" | "orden";

const TABS_PRINCIPALES: { id: TabPrincipal; label: string }[] = [
  { id: "pendientes", label: "Pendientes" },
  { id: "ordenes_de_compra", label: "Órdenes de Compra" },
  { id: "en_camino", label: "En Camino" },
  { id: "recibidas", label: "Recibidas" },
  { id: "rechazadas_canceladas", label: "Rechazadas/Canceladas" },
];

const SUBVISTAS_PENDIENTES: { id: SubvistaPendientes; label: string }[] = [
  { id: "programacion", label: "Por Programación" },
  { id: "producto", label: "Por Producto" },
  { id: "orden", label: "Por Orden" },
];

function destinoTexto(o: OrdenCompra): string | null {
  if (o.centroCosto) return o.centroCosto.nombre;
  if (o.huertaDestino) return o.huertaDestino.nombre;
  if (o.huertaOrigen) return o.huertaOrigen.nombre;
  return null;
}

function huertaIdDeOrden(o: OrdenCompra): string | null {
  return o.huertaDestino?.id ?? o.huertaOrigen?.id ?? null;
}

// Título + multi-producto (Prioridad 4, 7-sep-2026) — mismo patrón "+ Otro
// producto" que Aplicaciones/Fertirriego.
interface ProductoSolicitudForm {
  productoId: string;
  cantidad: string;
}

function productoSolicitudVacio(): ProductoSolicitudForm {
  return { productoId: "", cantidad: "" };
}

/**
 * Reestructura de Compras → Órdenes (Bloque 1-3, 2-sep-2026): 4 pestañas de
 * primer nivel por estado (Pendientes por default, con 3 sub-vistas adentro;
 * En Camino/Recibidas/Rechazadas y Canceladas simples). "Rechazadas y
 * Canceladas" como pestaña propia fue decisión explícita de Diego (no
 * estaba definida en el documento) — antes vivían escondidas detrás de un
 * checkbox "Mostrar canceladas/rechazadas" en la vista "Por orden".
 *
 * "Cotizar" vive en el Comparador de Cotizaciones (2-sep-2026): esta
 * pantalla ya no captura proveedor/precio directo, solo manda para allá con
 * el contexto de la orden.
 */
export default function Ordenes() {
  const navigate = useNavigate();
  const { productos } = useProductos(true);
  const { huertas } = useHuertas();
  const categorias = useCatalogoAbierto("/almacen/categorias");
  const tiposAplicacion = useCatalogoAbierto("/tipos-aplicacion");

  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendientesPorProducto, setPendientesPorProducto] = useState<PendienteIngredienteActivo[]>([]);
  const [pendientesPorProgramacion, setPendientesPorProgramacion] = useState<GrupoPendienteProgramacion[]>([]);
  const [tarjetasAbiertas, setTarjetasAbiertas] = useState<Set<string>>(new Set());

  const [tab, setTab] = useState<TabPrincipal>("pendientes");
  const [subvista, setSubvista] = useState<SubvistaPendientes>("programacion");

  // Filtros (Bloque 1, 2-sep-2026) — disponibles por igual en las 4
  // pestañas; dentro de Pendientes, Fecha/Tipo de aplicación se ocultan en
  // "Por Producto" porque esa vista suma a través de TODO el tiempo/todas
  // las programaciones, no tiene una fecha ni un tipo de aplicación único
  // que filtrar (decisión de alcance, no de producto — ver reporte).
  const [filtroHuertaId, setFiltroHuertaId] = useState("");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroTipoAplicacionId, setFiltroTipoAplicacionId] = useState("");
  const hayFiltrosActivos = !!(filtroHuertaId || filtroFechaDesde || filtroFechaHasta || filtroCategoria || filtroTipoAplicacionId);
  function limpiarFiltros() {
    setFiltroHuertaId("");
    setFiltroFechaDesde("");
    setFiltroFechaHasta("");
    setFiltroCategoria("");
    setFiltroTipoAplicacionId("");
  }

  // Pre-llenado de contexto desde una notificación (29-ago-2026): ?id=
  // resalta y hace scroll a la orden correspondiente en vez de dejar al
  // usuario buscarla entre todas — ahora además selecciona la pestaña
  // correcta según el estado de esa orden.
  const [searchParams] = useSearchParams();
  const idResaltado = searchParams.get("id");
  const refResaltada = useRef<HTMLDivElement>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [productosSolicitud, setProductosSolicitud] = useState<ProductoSolicitudForm[]>([productoSolicitudVacio()]);

  // Destino (4.1, 2-sep-2026) — obligatorio en solicitudes manuales: un
  // Centro de Costo del catálogo abierto, o una Huerta específica.
  const centrosCosto = useCatalogoAbierto("/compras/centros-costo");
  const [destinoTipo, setDestinoTipo] = useState<"" | "centro_costo" | "huerta">("");
  const [centroCostoId, setCentroCostoId] = useState("");
  const [huertaDestinoId, setHuertaDestinoId] = useState("");
  const [mostrarNuevoCentroCosto, setMostrarNuevoCentroCosto] = useState(false);
  const [nuevoCentroCostoNombre, setNuevoCentroCostoNombre] = useState("");

  function cargarTodo() {
    api
      .get<OrdenCompra[]>("/compras/ordenes?incluirCerradas=true")
      .then(setOrdenes)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
    api.get<GrupoPendienteProgramacion[]>("/compras/ordenes/pendientes-por-programacion").then(setPendientesPorProgramacion);
    api.get<PendienteIngredienteActivo[]>("/compras/ordenes/pendientes-por-ingrediente-activo").then(setPendientesPorProducto);
  }

  useEffect(cargarTodo, []);

  function alternarTarjeta(clave: string) {
    setTarjetasAbiertas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }

  useEffect(() => {
    if (!idResaltado || ordenes.length === 0) return;
    const o = ordenes.find((x) => x.id === idResaltado);
    if (!o) return;
    if (o.estado === "generada") setTab("en_camino");
    else if (o.estado === "recibida") setTab("recibidas");
    else if (o.estado === "rechazada" || o.estado === "cancelada") setTab("rechazadas_canceladas");
    else if (o.estado === "pendiente_autorizar" || o.estado === "pendiente_cotizar") {
      setTab("pendientes");
      setSubvista("orden");
    }
  }, [idResaltado, ordenes]);

  useEffect(() => {
    if (idResaltado) refResaltada.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [idResaltado, ordenes, tab, subvista]);

  // Ruta rápida desde el Comparador (3-sep-2026, Prioridad 1): "Ir a
  // Órdenes de Compra" manda aquí con ?tab=ordenes_de_compra&ordenCompraId=.
  const ordenCompraIdParaGeneracion = searchParams.get("ordenCompraId");
  useEffect(() => {
    if (searchParams.get("tab") === "ordenes_de_compra") setTab("ordenes_de_compra");
  }, [searchParams]);

  function actualizarProductoSolicitud(index: number, cambios: Partial<ProductoSolicitudForm>) {
    setProductosSolicitud((prev) => prev.map((p, i) => (i !== index ? p : { ...p, ...cambios })));
  }

  function agregarProductoSolicitud() {
    setProductosSolicitud((prev) => [...prev, productoSolicitudVacio()]);
  }

  function quitarProductoSolicitud(index: number) {
    setProductosSolicitud((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function crearOrden(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!destinoTipo || (destinoTipo === "centro_costo" && !centroCostoId) || (destinoTipo === "huerta" && !huertaDestinoId)) {
      setError("Elige un Destino para la solicitud.");
      return;
    }
    if (productosSolicitud.some((p) => !p.productoId || !p.cantidad)) {
      setError("Completa producto y cantidad en cada línea (o quítala).");
      return;
    }
    try {
      await api.post("/compras/ordenes", {
        titulo,
        productos: productosSolicitud.map((p) => ({ productoId: p.productoId, cantidadSolicitada: Number(p.cantidad) })),
        centroCostoId: destinoTipo === "centro_costo" ? centroCostoId : undefined,
        huertaDestinoId: destinoTipo === "huerta" ? huertaDestinoId : undefined,
      });
      setTitulo("");
      setProductosSolicitud([productoSolicitudVacio()]);
      setDestinoTipo("");
      setCentroCostoId("");
      setHuertaDestinoId("");
      setMostrarForm(false);
      cargarTodo();
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
      cargarTodo();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo autorizar.");
    }
  }

  async function rechazar(id: string) {
    setError(null);
    try {
      await api.post(`/compras/ordenes/${id}/rechazar`);
      cargarTodo();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo rechazar.");
    }
  }

  function irACotizar(ordenId: string) {
    navigate(`/compras/comparador?ordenCompraId=${ordenId}`);
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

  // ---- Filtros ----
  function pasaFiltroFecha(fechaIso: string | null) {
    if (!filtroFechaDesde && !filtroFechaHasta) return true;
    if (!fechaIso) return false;
    const fecha = fechaIso.slice(0, 10);
    if (filtroFechaDesde && fecha < filtroFechaDesde) return false;
    if (filtroFechaHasta && fecha > filtroFechaHasta) return false;
    return true;
  }

  function grupoProgramacionPasaFiltros(g: GrupoPendienteProgramacion) {
    if (filtroHuertaId && g.huertaId !== filtroHuertaId) return false;
    if (!pasaFiltroFecha(g.fecha)) return false;
    if (filtroTipoAplicacionId && g.tipoAplicacionId !== filtroTipoAplicacionId) return false;
    if (filtroCategoria && !g.lineas.some((l) => l.categoria === filtroCategoria)) return false;
    return true;
  }

  function grupoProductoPasaFiltros(g: PendienteIngredienteActivo) {
    if (filtroCategoria && g.categoria !== filtroCategoria) return false;
    if (filtroHuertaId && !g.origenes.some((o) => o.huertaId === filtroHuertaId)) return false;
    return true;
  }

  function ordenPasaFiltros(o: OrdenCompra) {
    if (filtroHuertaId && huertaIdDeOrden(o) !== filtroHuertaId) return false;
    if (!pasaFiltroFecha(o.fechaEfectiva)) return false;
    if (filtroCategoria && o.producto.categoria !== filtroCategoria) return false;
    if (filtroTipoAplicacionId && o.tipoAplicacionId !== filtroTipoAplicacionId) return false;
    return true;
  }

  const ordenesPendientes = ordenes.filter((o) => (o.estado === "pendiente_autorizar" || o.estado === "pendiente_cotizar") && ordenPasaFiltros(o));
  const ordenesEnCamino = ordenes.filter((o) => o.estado === "generada" && ordenPasaFiltros(o));
  const ordenesRecibidas = ordenes.filter((o) => o.estado === "recibida" && ordenPasaFiltros(o));
  const ordenesRechazadasCanceladas = ordenes.filter((o) => (o.estado === "rechazada" || o.estado === "cancelada") && ordenPasaFiltros(o));
  const gruposProgramacionFiltrados = pendientesPorProgramacion.filter(grupoProgramacionPasaFiltros);
  const gruposProductoFiltrados = pendientesPorProducto.filter(grupoProductoPasaFiltros);

  function BarraFiltros({ mostrarFechaYTipoAplicacion }: { mostrarFechaYTipoAplicacion: boolean }) {
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <label className="field">
          Huerta
          <select value={filtroHuertaId} onChange={(e) => setFiltroHuertaId(e.target.value)}>
            <option value="">Todas</option>
            {huertas.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
        </label>
        {mostrarFechaYTipoAplicacion && (
          <>
            <label className="field">
              Desde
              <FechaInput value={filtroFechaDesde} onChange={setFiltroFechaDesde} />
            </label>
            <label className="field">
              Hasta
              <FechaInput value={filtroFechaHasta} onChange={setFiltroFechaHasta} />
            </label>
          </>
        )}
        <label className="field">
          Tipo de producto
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="">Todos</option>
            {categorias.items.map((c) => (
              <option key={c.id} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        {mostrarFechaYTipoAplicacion && (
          <label className="field">
            Tipo de aplicación
            <select value={filtroTipoAplicacionId} onChange={(e) => setFiltroTipoAplicacionId(e.target.value)}>
              <option value="">Todos</option>
              {tiposAplicacion.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        {hayFiltrosActivos && (
          <button className="btn-secondary" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
      </div>
    );
  }

  function tarjetaOrdenIndividual(o: OrdenCompra, colapsable: boolean) {
    const abierta = !colapsable || tarjetasAbiertas.has(o.id);
    const destino = destinoTexto(o);
    return (
      <div
        key={o.id}
        ref={o.id === idResaltado ? refResaltada : undefined}
        className="card"
        style={o.id === idResaltado ? { outline: "2px solid var(--pink)", outlineOffset: 2 } : undefined}
      >
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, cursor: colapsable ? "pointer" : undefined }}
          onClick={colapsable ? () => alternarTarjeta(o.id) : undefined}
        >
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
            <span className={`tag ${tagEstado(o.estado)}`}>{ETIQUETAS_ESTADO[o.estado]}</span>{" "}
            <span className="tag tag-neutral">{o.origen}</span>
            {o.numero != null && <span className="tag tag-neutral">Folio {o.numero}</span>}
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
              {o.producto.nombreComercial} — {o.cantidadSolicitada} {o.producto.unidad}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              {destino && <>Destino: {destino} · </>}
              Solicitante: {o.solicitanteNombre} · {formatearFecha(o.fechaEfectiva)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
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
            {o.numero != null && (
              <button className="btn-secondary" onClick={() => descargarPdf(o.id, o.numero)}>
                Descargar PDF
              </button>
            )}
            {colapsable && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{abierta ? "▲" : "▼"}</span>}
          </div>
        </div>

        {abierta && (
          <div style={{ marginTop: 8, borderTop: colapsable ? "1px solid var(--border)" : undefined, paddingTop: colapsable ? 8 : 0 }}>
            {colapsable && (
              <div style={{ fontSize: 12.5, marginBottom: 4 }}>
                <strong>Solicitante:</strong> {o.solicitanteNombre}
              </div>
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
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Solicitar compra"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={crearOrden} className="card" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          <label className="field">
            Título
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Refacciones bomba de riego"
              required
              style={{ minWidth: 280 }}
            />
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {productosSolicitud.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="field">
                  Producto (autorizado)
                  <select value={p.productoId} onChange={(e) => actualizarProductoSolicitud(i, { productoId: e.target.value })} required>
                    <option value="">Selecciona…</option>
                    {productos.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {nombreConMarca(prod)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Cantidad
                  <input
                    type="number"
                    step="0.001"
                    value={p.cantidad}
                    onChange={(e) => actualizarProductoSolicitud(i, { cantidad: e.target.value })}
                    required
                  />
                </label>
                {productosSolicitud.length > 1 && (
                  <button type="button" className="btn-secondary" onClick={() => quitarProductoSolicitud(i)}>
                    Quitar
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-secondary" style={{ width: "fit-content" }} onClick={agregarProductoSolicitud}>
              + Otro producto
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
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
          </div>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS_PRINCIPALES.map((t) => (
          <button key={t.id} className={tab === t.id ? "btn-primary" : "btn-secondary"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pendientes" && (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
            {SUBVISTAS_PENDIENTES.map((s) => (
              <button key={s.id} className={subvista === s.id ? "btn-primary" : "btn-secondary"} onClick={() => setSubvista(s.id)}>
                {s.label}
              </button>
            ))}
          </div>

          <BarraFiltros mostrarFechaYTipoAplicacion={subvista !== "producto"} />

          {subvista === "programacion" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                Una tarjeta = una Aplicación/Fertirriego/Fertilización Granular completa con todos sus productos, o una solicitud manual —
                para cotizar/comprar todo lo que necesita un mismo evento de una sola vez. Coexiste con las otras dos vistas.
              </p>
              {gruposProgramacionFiltrados.map((g) => {
                const abierta = tarjetasAbiertas.has(g.clave);
                return (
                  <div key={g.clave} className="card">
                    <div
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, cursor: "pointer" }}
                      onClick={() => alternarTarjeta(g.clave)}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        {g.titulo ?? TIPO_PROGRAMACION_LABEL[g.tipo]}
                        {g.huertaNombre && ` — ${g.huertaNombre}`}
                        {g.tipoAplicacionNombre && <span className="tag tag-neutral" style={{ marginLeft: 6 }}>{g.tipoAplicacionNombre}</span>}
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
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                      {g.destino && <>Destino: {g.destino.nombre} · </>}
                      Solicitante: {g.solicitanteNombre} · {formatearFecha(g.fecha)}
                    </div>
                    {abierta && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                        {g.lineas.map((l) => (
                          <div key={l.ordenId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, gap: 8 }}>
                            <span>
                              {l.ingredienteActivo ?? l.nombreComercial} — {formatearNumero(l.cantidadPendiente)} {l.unidad}{" "}
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
              {gruposProgramacionFiltrados.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin nada pendiente por Programación.</p>}
            </div>
          ) : subvista === "producto" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                Suma la cantidad pendiente de cada Ingrediente Activo (o Producto Comercial, si no aplica Ingrediente Activo) entre todas las
                órdenes pendientes, sin importar de dónde vinieron — para comprar en volumen. No reemplaza la vista por orden, sirve para
                anticipar en vez de resolver una orden puntual.
              </p>
              {gruposProductoFiltrados.map((g) => (
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
              {gruposProductoFiltrados.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin nada pendiente por Producto.</p>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                Una tarjeta = una orden individual, sin agrupar — útil para resolver una solicitud puntual sin entrar a toda la programación
                que la generó. Haz clic para ver el detalle completo.
              </p>
              {ordenesPendientes.map((o) => tarjetaOrdenIndividual(o, true))}
              {ordenesPendientes.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin órdenes pendientes.</p>}
            </div>
          )}
        </>
      )}

      {tab === "ordenes_de_compra" && <OrdenesDeCompra ordenCompraIdInicial={ordenCompraIdParaGeneracion} />}

      {tab === "en_camino" && (
        <>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
            Solo lectura — la recepción física ya se confirma desde Almacén → "En Camino" (Prioridad 4).
          </p>
          <BarraFiltros mostrarFechaYTipoAplicacion />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ordenesEnCamino.map((o) => tarjetaOrdenIndividual(o, false))}
            {ordenesEnCamino.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin órdenes en camino.</p>}
          </div>
        </>
      )}

      {tab === "recibidas" && (
        <>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
            Espejo de solo lectura de lo que Almacén ya confirmó recibido (Prioridad 4).
          </p>
          <BarraFiltros mostrarFechaYTipoAplicacion />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ordenesRecibidas.map((o) => tarjetaOrdenIndividual(o, false))}
            {ordenesRecibidas.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin órdenes recibidas.</p>}
          </div>
        </>
      )}

      {tab === "rechazadas_canceladas" && (
        <>
          <BarraFiltros mostrarFechaYTipoAplicacion />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ordenesRechazadasCanceladas.map((o) => tarjetaOrdenIndividual(o, false))}
            {ordenesRechazadasCanceladas.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin órdenes rechazadas o canceladas.</p>}
          </div>
        </>
      )}
    </div>
  );
}
