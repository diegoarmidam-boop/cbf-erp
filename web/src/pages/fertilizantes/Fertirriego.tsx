import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import type { ConcentracionUnidad, FertirriegoProgramacion, FrecuenciaFertirriego, Producto, SeccionRiego } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";
import { presentacionTexto } from "../../lib/producto";

const ETIQUETAS_ESTADO: Record<string, string> = {
  programada: "Programada",
  entregada: "Entregada — ejecución diaria en Riego",
  vencida: "Vencida/liberada",
  cancelada: "Cancelada",
};

const ETIQUETAS_FRECUENCIA: Record<FrecuenciaFertirriego, string> = {
  diario: "Diario",
  cada_2_dias: "Cada 2 días",
  cada_3_dias: "Cada 3 días",
  patron_2_1: "2 sí, 1 no",
};

function tagEstado(estado: string) {
  if (estado === "entregada") return "tag-success";
  if (estado === "vencida" || estado === "cancelada") return "tag-danger";
  return "tag-warning";
}

function hoyISO(): string {
  const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formaEntero(valor: string): string {
  const n = Number(valor);
  return Number.isFinite(n) ? n.toLocaleString("es-MX", { maximumFractionDigits: 3 }) : valor;
}

interface ProductoFertirriegoForm {
  productoId: string;
  dosisValor: string;
  dosisUnidad: ConcentracionUnidad;
}

function productoFertirriegoFormVacio(): ProductoFertirriegoForm {
  return { productoId: "", dosisValor: "", dosisUnidad: "ml_l" };
}

export default function Fertirriego() {
  const { huertas } = useHuertas();

  const [lista, setLista] = useState<FertirriegoProgramacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [huertaId, setHuertaId] = useState("");
  const [seccionesHuerta, setSeccionesHuerta] = useState<SeccionRiego[]>([]);
  const [seccionIds, setSeccionIds] = useState<string[]>([]);
  // Varios productos en el mismo fertirriego (10-ago-2026): mismo mecanismo
  // que Aplicaciones — cada uno con su propia concentración, todos
  // comparten litrosAguaPorHa (abajo).
  const [productosForm, setProductosForm] = useState<ProductoFertirriegoForm[]>([productoFertirriegoFormVacio()]);
  const [litrosAguaPorHa, setLitrosAguaPorHa] = useState("");
  const [frecuencia, setFrecuencia] = useState<FrecuenciaFertirriego>("diario");
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState(hoyISO());

  function cargar() {
    setCargando(true);
    api
      .get<FertirriegoProgramacion[]>("/fertilizantes/fertirriego")
      .then(setLista)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  useEffect(() => {
    api.get<Producto[]>("/fertilizantes/granular/productos").then(setProductos);
  }, []);

  useEffect(() => {
    if (!huertaId) {
      setSeccionesHuerta([]);
      return;
    }
    api.get<SeccionRiego[]>(`/secciones-riego?huertaId=${huertaId}`).then(setSeccionesHuerta);
  }, [huertaId]);

  function alternarSeccion(id: string) {
    setSeccionIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function actualizarProductoForm(index: number, cambios: Partial<ProductoFertirriegoForm>) {
    setProductosForm((prev) => prev.map((p, i) => (i !== index ? p : { ...p, ...cambios })));
  }

  function agregarProductoForm() {
    setProductosForm((prev) => [...prev, productoFertirriegoFormVacio()]);
  }

  function quitarProductoForm(index: number) {
    setProductosForm((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function programar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/fertilizantes/fertirriego", {
        huertaId,
        seccionIds,
        productos: productosForm.map((p) => ({ productoId: p.productoId, dosisValor: Number(p.dosisValor), dosisUnidad: p.dosisUnidad })),
        litrosAguaPorHa: Number(litrosAguaPorHa),
        frecuencia,
        fechaInicio,
        fechaFin,
      });
      setMostrarForm(false);
      setSeccionIds([]);
      setProductosForm([productoFertirriegoFormVacio()]);
      setLitrosAguaPorHa("");
      setFechaInicio(hoyISO());
      setFechaFin(hoyISO());
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo programar el fertirriego.");
    }
  }

  async function entregar(id: string) {
    setError(null);
    try {
      await api.post(`/fertilizantes/fertirriego/${id}/entregar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar la entrega.");
    }
  }

  async function liberar(id: string) {
    setError(null);
    try {
      await api.post(`/fertilizantes/fertirriego/${id}/liberar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo liberar.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Programar fertirriego"}
        </button>
      </div>

      <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>
        La ejecución diaria (¿se metió hoy?, ¿cuánto?) se registra desde Riego una vez entregado.
      </p>

      {mostrarForm && (
        <form onSubmit={programar} className="card" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="field">
              Huerta
              <select value={huertaId} onChange={(e) => { setHuertaId(e.target.value); setSeccionIds([]); }} required>
                <option value="">Selecciona…</option>
                {huertas.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {huertaId && (
            <div className="field">
              Secciones de Riego
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {seccionesHuerta.map((s) => (
                  <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--ink)" }}>
                    <input type="checkbox" checked={seccionIds.includes(s.id)} onChange={() => alternarSeccion(s.id)} />
                    {s.nombre}
                  </label>
                ))}
                {seccionesHuerta.length === 0 && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Esta Huerta no tiene Secciones de Riego.</span>}
              </div>
            </div>
          )}

          <div className="field">
            Productos (mismo fertirriego — cada uno con su propia concentración)
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {productosForm.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="field">
                    Producto (fertilizante autorizado)
                    <select value={p.productoId} onChange={(e) => actualizarProductoForm(i, { productoId: e.target.value })} required>
                      <option value="">Selecciona…</option>
                      {productos.map((prod) => (
                        <option key={prod.id} value={prod.id}>
                          {prod.nombreComercial} ({presentacionTexto(prod)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Dosis
                    <input
                      type="number"
                      step="0.0001"
                      style={{ width: 100 }}
                      value={p.dosisValor}
                      onChange={(e) => actualizarProductoForm(i, { dosisValor: e.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    Unidad
                    <select value={p.dosisUnidad} onChange={(e) => actualizarProductoForm(i, { dosisUnidad: e.target.value as ConcentracionUnidad })}>
                      <option value="ml_l">ml/L</option>
                      <option value="g_l">g/L</option>
                      <option value="kg_l">kg/L</option>
                    </select>
                  </label>
                  {productosForm.length > 1 && (
                    <button type="button" className="btn-secondary" onClick={() => quitarProductoForm(i)}>
                      Quitar
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="btn-secondary" style={{ marginTop: 8, width: "fit-content" }} onClick={agregarProductoForm}>
              + Otro producto
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="field">
              Litros de agua / ha
              <input type="number" step="0.0001" value={litrosAguaPorHa} onChange={(e) => setLitrosAguaPorHa(e.target.value)} required />
            </label>
            <label className="field">
              Frecuencia
              <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaFertirriego)}>
                {Object.entries(ETIQUETAS_FRECUENCIA).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="field">
              Fecha inicio
              <FechaInput value={fechaInicio} onChange={setFechaInicio} required />
            </label>
            <label className="field">
              Fecha fin
              <FechaInput value={fechaFin} onChange={setFechaFin} required />
            </label>
            <button className="btn-primary" type="submit">
              Programar
            </button>
          </div>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {lista.map((f) => (
            <div key={f.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span className={`tag ${tagEstado(f.estado)}`}>{ETIQUETAS_ESTADO[f.estado]}</span>{" "}
                  {!f.comprometido && f.estado === "programada" && <span className="tag tag-neutral">Esperando compra automática</span>}{" "}
                  {f.alertaVencimiento && <span className="tag tag-danger">15+ días sin entregar</span>}
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
                    {f.huerta.nombre} — {f.productos.map((p) => p.producto.nombreComercial).join(" + ")}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    Secciones: {f.secciones.map((s) => s.seccion.nombre).join(", ") || "—"}
                  </div>
                  {f.productos.map((p) => (
                    <div key={p.id} style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      {p.producto.nombreComercial}: {formaEntero(p.cantidadTotalCalculada)} {p.producto.unidad} · {p.dosisValor}{" "}
                      {p.dosisUnidad.replace("_", "/")}
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {f.litrosAguaPorHa} L agua/ha · {ETIQUETAS_FRECUENCIA[f.frecuencia]} · {formatearFecha(f.fechaInicio)} a {formatearFecha(f.fechaFin)}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {f.estado === "programada" && f.comprometido && (
                    <button className="btn-primary" onClick={() => entregar(f.id)}>
                      Confirmar entrega
                    </button>
                  )}
                  {f.estado === "programada" && (
                    <button className="btn-secondary" onClick={() => liberar(f.id)}>
                      Liberar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {lista.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay fertirriegos programados.</p>}
        </div>
      )}
    </div>
  );
}
