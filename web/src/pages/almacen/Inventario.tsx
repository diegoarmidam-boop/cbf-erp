import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useProductos } from "../../lib/useProductos";
import { useCatalogoAbierto } from "../../lib/useCatalogoAbierto";
import SelectConAgregar from "../../components/SelectConAgregar";
import { presentacionTexto } from "../../lib/producto";
import { formatearFecha } from "../../lib/fecha";
import { formatearNumero } from "../../lib/numero";
import type { CancelacionPendienteBodega, MovimientoAlmacenCentral, Producto, ProductoLote, TipoMovimientoAlmacenCentral } from "../../lib/types";

const UNIDADES = ["L", "kg", "g", "ml", "pieza", "bulto", "garrafa"];

const ETIQUETAS_MOVIMIENTO: Record<TipoMovimientoAlmacenCentral, string> = {
  entrada_compra: "Entrada (compra)",
  salida_comprometida: "Salida comprometida",
  salida_real: "Salida real",
  prestamo_rancho: "Préstamo a rancho",
  merma: "Merma",
  baja_caducidad: "Baja por caducidad",
  abono_sobrante: "Abono de sobrante",
  ajuste_manual: "Ajuste manual",
  consumo_maquinaria: "Consumo de maquinaria",
};

type Columna = "categoria" | "ingredienteActivo" | "estado" | "autorizado";

const COLUMNAS: { value: Columna; label: string }[] = [
  { value: "categoria", label: "Categoría" },
  { value: "ingredienteActivo", label: "Ingrediente activo" },
  { value: "estado", label: "Estado" },
  { value: "autorizado", label: "Autorizado" },
];

interface Filtro {
  columna: Columna;
  valor: string;
}

export default function Inventario() {
  const { productos, cargando, refetch } = useProductos();
  const categorias = useCatalogoAbierto("/almacen/categorias");
  const ingredientes = useCatalogoAbierto("/almacen/ingredientes-activos");
  const contenedores = useCatalogoAbierto("/almacen/contenedores");
  const marcas = useCatalogoAbierto("/almacen/marcas");

  const [stock, setStock] = useState<Record<string, number>>({});
  const [comprometido, setComprometido] = useState<Record<string, number>>({});
  useEffect(() => {
    api.get<Record<string, number>>("/almacen/movimientos/stock-todos").then(setStock).catch(() => {});
    api.get<Record<string, number>>("/almacen/movimientos/comprometido-todos").then(setComprometido).catch(() => {});
  }, [productos]);

  // Protocolo de cancelación de Aplicaciones (9.7): Bodega no tiene acceso al
  // módulo de Aplicaciones, así que el aviso de "se te va a regresar
  // producto" y la firma digital de recepción viven aquí, en su propio módulo.
  const [cancelacionesPendientes, setCancelacionesPendientes] = useState<CancelacionPendienteBodega[]>([]);
  function cargarCancelacionesPendientes() {
    api
      .get<CancelacionPendienteBodega[]>("/aplicaciones/cancelaciones-pendientes-bodega")
      .then(setCancelacionesPendientes)
      .catch(() => setCancelacionesPendientes([]));
  }
  useEffect(cargarCancelacionesPendientes, []);

  async function confirmarRecepcion(item: CancelacionPendienteBodega) {
    setError(null);
    try {
      if (item.tipo === "ajuste_dosis") {
        await api.post(`/aplicaciones/ajustes/${item.id}/confirmar-recepcion`);
      } else if (item.origen === "granular") {
        await api.post(`/fertilizantes/granular/${item.id}/confirmar-recepcion-cancelacion`);
      } else {
        await api.post(`/aplicaciones/${item.id}/confirmar-recepcion-cancelacion`);
      }
      cargarCancelacionesPendientes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar.");
    }
  }

  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [categoria, setCategoria] = useState("");
  const [ingredienteActivo, setIngredienteActivo] = useState("");
  const [nombreComercial, setNombreComercial] = useState("");
  const [marca, setMarca] = useState("");
  const [contenedor, setContenedor] = useState("");
  const [presentacionCantidad, setPresentacionCantidad] = useState("");
  const [unidad, setUnidad] = useState("");
  const [requiereLote, setRequiereLote] = useState(true);

  const requiereIngrediente = categoria === "agroquimico" || categoria === "fertilizante";

  const [busqueda, setBusqueda] = useState("");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const [nuevaColumna, setNuevaColumna] = useState<Columna>("categoria");
  const [nuevoValor, setNuevoValor] = useState("");

  const [productoDetalleId, setProductoDetalleId] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  async function toggleActivo(p: Producto) {
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
    const payload = {
      categoria,
      ingredienteActivo: requiereIngrediente ? ingredienteActivo || undefined : undefined,
      nombreComercial,
      marca: marca || undefined,
      contenedor,
      presentacionCantidad: Number(presentacionCantidad),
      unidad,
      requiereLote,
    };
    try {
      if (editandoId) {
        await api.patch(`/almacen/productos/${editandoId}`, payload);
        setMensaje("Producto actualizado.");
      } else {
        const r = await api.post<{ mensaje?: string }>("/almacen/productos", payload);
        setMensaje(r.mensaje ?? "Producto autorizado y agregado al catálogo.");
      }
      setNombreComercial("");
      setMarca("");
      setContenedor("");
      setPresentacionCantidad("");
      setUnidad("");
      setIngredienteActivo("");
      setCategoria("");
      setRequiereLote(true);
      setMostrarForm(false);
      setEditandoId(null);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  function iniciarEdicion(p: Producto) {
    setEditandoId(p.id);
    setCategoria(p.categoria);
    setIngredienteActivo(p.ingredienteActivo ?? "");
    setNombreComercial(p.nombreComercial);
    setMarca(p.marca ?? "");
    setContenedor(p.contenedor);
    setPresentacionCantidad(String(p.presentacionCantidad));
    setUnidad(p.unidad);
    setRequiereLote(p.requiereLote);
    setError(null);
    setMostrarForm(true);
  }

  function valoresDeColumna(columna: Columna): string[] {
    if (columna === "categoria") return categorias.items.map((c) => c.nombre);
    if (columna === "ingredienteActivo") return ingredientes.items.map((i) => i.nombre);
    if (columna === "estado") return ["activo", "inactivo"];
    return ["si", "no"];
  }

  function agregarFiltro() {
    if (!nuevoValor) return;
    setFiltros((prev) => [...prev.filter((f) => f.columna !== nuevaColumna), { columna: nuevaColumna, valor: nuevoValor }]);
    setNuevoValor("");
  }

  function coincideFiltro(p: Producto, f: Filtro): boolean {
    if (f.columna === "categoria") return p.categoria === f.valor;
    if (f.columna === "ingredienteActivo") return (p.ingredienteActivo ?? "") === f.valor;
    if (f.columna === "estado") return (f.valor === "activo") === p.activo;
    return (f.valor === "si") === p.autorizado;
  }

  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      const coincideBusqueda =
        !texto ||
        p.nombreComercial.toLowerCase().includes(texto) ||
        (p.ingredienteActivo ?? "").toLowerCase().includes(texto) ||
        p.categoria.toLowerCase().includes(texto);
      const coincideFiltros = filtros.every((f) => coincideFiltro(p, f));
      return coincideBusqueda && coincideFiltros;
    });
  }, [productos, busqueda, filtros]);

  if (productoDetalleId) {
    return <DetalleProducto productoId={productoDetalleId} onVolver={() => setProductoDetalleId(null)} />;
  }

  return (
    <div>
      {cancelacionesPendientes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {cancelacionesPendientes.map((c, i) => (
            <div
              key={`${c.tipo}-${c.id}-${i}`}
              className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}
            >
              <div>
                <span className="tag tag-warning">
                  {c.tipo === "ajuste_dosis" ? "Ajuste de dosis — se te va a regresar producto" : "Programación cancelada — se te va a regresar producto"}
                </span>
                <div style={{ fontSize: 12.5, marginTop: 4 }}>
                  {c.huerta.nombre} — {c.cantidadRegresada} {c.producto.unidad} de {c.producto.nombreComercial}
                </div>
              </div>
              <button className="btn-primary" onClick={() => confirmarRecepcion(c)}>
                Ya llegó — confirmar recepción
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <button
          className="btn-primary"
          onClick={() => {
            if (mostrarForm) setEditandoId(null);
            setMostrarForm((v) => !v);
          }}
        >
          {mostrarForm ? "Cancelar" : "+ Nuevo producto"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 18 }}>
          <SelectConAgregar
            label="Categoría"
            value={categoria}
            onChange={setCategoria}
            items={categorias.items}
            onAgregar={categorias.agregar}
            required
          />
          {requiereIngrediente && (
            <SelectConAgregar
              label="Ingrediente activo"
              value={ingredienteActivo}
              onChange={setIngredienteActivo}
              items={ingredientes.items}
              onAgregar={ingredientes.agregar}
            />
          )}
          <label className="field">
            Nombre comercial
            <input value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} required />
          </label>
          <SelectConAgregar
            label="Marca"
            value={marca}
            onChange={setMarca}
            items={marcas.items}
            onAgregar={marcas.agregar}
          />
          <SelectConAgregar
            label="Contenedor"
            value={contenedor}
            onChange={setContenedor}
            items={contenedores.items}
            onAgregar={contenedores.agregar}
            required
          />
          <label className="field">
            Cantidad
            <input type="number" min={0} step="0.001" value={presentacionCantidad} onChange={(e) => setPresentacionCantidad(e.target.value)} required />
          </label>
          <label className="field">
            Unidad
            <select value={unidad} onChange={(e) => setUnidad(e.target.value)} required>
              <option value="">Selecciona…</option>
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
            {editandoId ? "Guardar cambios" : "Guardar"}
          </button>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
      {mensaje && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{mensaje}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <label className="field" style={{ maxWidth: 320 }}>
          Buscar producto
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre comercial, ingrediente activo o categoría…"
          />
        </label>
        <button className="btn-secondary" onClick={() => setMostrarFiltros((v) => !v)}>
          {mostrarFiltros ? "Ocultar filtros" : "Filtros"}
        </button>
      </div>

      {mostrarFiltros && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label className="field">
              Columna
              <select value={nuevaColumna} onChange={(e) => { setNuevaColumna(e.target.value as Columna); setNuevoValor(""); }}>
                {COLUMNAS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Valor
              <select value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)}>
                <option value="">Selecciona…</option>
                {valoresDeColumna(nuevaColumna).map((v) => (
                  <option key={v} value={v}>
                    {nuevaColumna === "estado" ? (v === "activo" ? "Activo" : "Inactivo") : nuevaColumna === "autorizado" ? (v === "si" ? "Sí" : "No") : v}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-secondary" onClick={agregarFiltro} disabled={!nuevoValor}>
              Agregar filtro
            </button>
          </div>
          {filtros.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {filtros.map((f) => (
                <span key={f.columna} className="tag tag-neutral" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {COLUMNAS.find((c) => c.value === f.columna)?.label}: {f.valor}
                  <button
                    type="button"
                    onClick={() => setFiltros((prev) => prev.filter((x) => x.columna !== f.columna))}
                    style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontWeight: 700 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre comercial</th>
              <th>Marca</th>
              <th>Ingrediente activo</th>
              <th>Categoría</th>
              <th>Presentación</th>
              <th>Existencia</th>
              <th>Autorizado</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productosFiltrados.map((p) => (
              <tr key={p.id}>
                <td>
                  <button
                    type="button"
                    onClick={() => setProductoDetalleId(p.id)}
                    style={{ border: "none", background: "none", color: "var(--pink)", cursor: "pointer", padding: 0, font: "inherit", fontWeight: 600 }}
                  >
                    {p.nombreComercial}
                  </button>
                </td>
                <td>{p.marca ?? "—"}</td>
                <td>{p.ingredienteActivo ?? "—"}</td>
                <td>{p.categoria}</td>
                <td>{presentacionTexto(p)}</td>
                <td>
                  {stock[p.id] != null ? `${formatearNumero(stock[p.id]!)} ${p.unidad}` : "—"}
                  {!!comprometido[p.id] && (
                    <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>
                      + {formatearNumero(comprometido[p.id]!)} {p.unidad} comprometido
                    </div>
                  )}
                </td>
                <td>
                  <span className={`tag ${p.autorizado ? "tag-success" : "tag-warning"}`}>{p.autorizado ? "Sí" : "Pendiente"}</span>
                </td>
                <td>
                  <span className={`tag ${p.activo ? "tag-success" : "tag-danger"}`}>{p.activo ? "Activo" : "Inactivo"}</span>
                </td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="btn-secondary" onClick={() => iniciarEdicion(p)}>
                    Editar
                  </button>
                  <button className="btn-secondary" onClick={() => toggleActivo(p)}>
                    {p.activo ? "Desactivar" : "Reactivar"}
                  </button>
                </td>
              </tr>
            ))}
            {productosFiltrados.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                  Ningún producto coincide con la búsqueda/filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DetalleProducto({ productoId, onVolver }: { productoId: string; onVolver: () => void }) {
  const { productos } = useProductos();
  const producto = productos.find((p) => p.id === productoId);
  const [total, setTotal] = useState<number | null>(null);
  const [comprometido, setComprometido] = useState<number>(0);
  const [lotes, setLotes] = useState<ProductoLote[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoAlmacenCentral[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ total: number; lotes: ProductoLote[] }>(`/almacen/movimientos/${productoId}/stock`)
      .then((r) => {
        setTotal(r.total);
        setLotes(r.lotes);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
    api
      .get<MovimientoAlmacenCentral[]>(`/almacen/movimientos/${productoId}`)
      .then(setMovimientos)
      .catch(() => {});
    api
      .get<Record<string, number>>("/almacen/movimientos/comprometido-todos")
      .then((r) => setComprometido(r[productoId] ?? 0))
      .catch(() => {});
  }, [productoId]);

  return (
    <div>
      <button className="btn-secondary" onClick={onVolver} style={{ marginBottom: 14 }}>
        ← Volver al Inventario
      </button>

      {producto && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>{producto.nombreComercial}</h2>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <span className="tag tag-neutral">{producto.categoria}</span>
            {producto.marca && <span className="tag tag-neutral">{producto.marca}</span>}
            {producto.ingredienteActivo && <span className="tag tag-neutral">{producto.ingredienteActivo}</span>}
            <span className="tag tag-neutral">{presentacionTexto(producto)}</span>
            <span className={`tag ${producto.autorizado ? "tag-success" : "tag-warning"}`}>{producto.autorizado ? "Autorizado" : "Pendiente"}</span>
            <span className={`tag ${producto.activo ? "tag-success" : "tag-danger"}`}>{producto.activo ? "Activo" : "Inactivo"}</span>
          </div>
        </div>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {total != null && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div className="kpi-card" style={{ maxWidth: 240 }}>
            <div className="label">Stock disponible</div>
            <div className="value">
              {formatearNumero(total)} {producto?.unidad}
            </div>
          </div>
          {comprometido > 0 && (
            <div className="kpi-card" style={{ maxWidth: 280 }}>
              <div className="label">Comprometido pendiente de entregar</div>
              <div className="value">
                {formatearNumero(comprometido)} {producto?.unidad}
              </div>
            </div>
          )}
        </div>
      )}

      {producto?.requiereLote && (
        <>
          <h3 style={{ marginBottom: 10 }}>Lotes</h3>
          <table style={{ marginBottom: 20 }}>
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
                  <td>{formatearFecha(l.fechaCaducidad)}</td>
                  <td>{formatearNumero(l.cantidadActual)}</td>
                </tr>
              ))}
              {lotes.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                    Sin lotes registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <h3 style={{ marginBottom: 10 }}>Movimientos</h3>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Cantidad</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => (
            <tr key={m.id}>
              <td>{formatearFecha(m.fecha)}</td>
              <td>{ETIQUETAS_MOVIMIENTO[m.tipo]}</td>
              <td>{formatearNumero(m.cantidad)}</td>
              <td>{m.motivoAjuste ?? "—"}</td>
            </tr>
          ))}
          {movimientos.length === 0 && (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                Sin movimientos todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
