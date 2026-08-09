import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useHuertas } from "../../lib/useHuertas";
import { usePersonal } from "../../lib/usePersonal";
import type { Aplicacion, ConcentracionUnidad, Cuadro, Equipo, GrupoPago, Producto, RecursoTipo } from "../../lib/types";

const ETIQUETAS_ESTADO: Record<string, string> = {
  programada: "Programada",
  entregada: "Entregada — pendiente de realizar",
  realizada: "Realizada",
  vencida: "Vencida/liberada",
  cancelada: "Cancelada",
};

function tagEstado(estado: string) {
  if (estado === "realizada") return "tag-success";
  if (estado === "vencida" || estado === "cancelada") return "tag-danger";
  if (estado === "entregada") return "tag-neutral";
  return "tag-warning";
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formaEntero(valor: string): string {
  const n = Number(valor);
  return Number.isFinite(n) ? n.toLocaleString("es-MX", { maximumFractionDigits: 3 }) : valor;
}

export default function Aplicaciones() {
  const { usuario } = useAuth();
  const { huertas } = useHuertas();
  const { personal } = usePersonal();

  const [aplicaciones, setAplicaciones] = useState<Aplicacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Programar ----
  const [mostrarForm, setMostrarForm] = useState(false);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [equiposImplemento, setEquiposImplemento] = useState<Equipo[]>([]);
  const [huertaId, setHuertaId] = useState("");
  const [cuadrosHuerta, setCuadrosHuerta] = useState<Cuadro[]>([]);
  const [cuadroIds, setCuadroIds] = useState<string[]>([]);
  const [productoId, setProductoId] = useState("");
  const [recursoTipo, setRecursoTipo] = useState<RecursoTipo>("gente");
  const [equipoId, setEquipoId] = useState("");
  const [concentracionValor, setConcentracionValor] = useState("");
  const [concentracionUnidad, setConcentracionUnidad] = useState<ConcentracionUnidad>("ml_l");
  const [litrosMezclaPorHa, setLitrosMezclaPorHa] = useState("");
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState(hoyISO());

  // ---- Registrar realizada ----
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [gruposHuerta, setGruposHuerta] = useState<GrupoPago[]>([]);
  const [quien, setQuien] = useState(""); // "p:<id>" o "g:<id>"
  const [horas, setHoras] = useState("");
  const [fechaReal, setFechaReal] = useState(hoyISO());

  function cargar() {
    setCargando(true);
    api
      .get<Aplicacion[]>("/aplicaciones")
      .then(setAplicaciones)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  useEffect(() => {
    api.get<Producto[]>("/aplicaciones/productos").then(setProductos);
    api.get<Equipo[]>("/aplicaciones/equipos-implemento").then(setEquiposImplemento);
  }, []);

  useEffect(() => {
    if (!huertaId) {
      setCuadrosHuerta([]);
      return;
    }
    api.get<Cuadro[]>(`/cuadros?huertaId=${huertaId}`).then(setCuadrosHuerta);
  }, [huertaId]);

  function alternarCuadro(id: string) {
    setCuadroIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function programar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/aplicaciones", {
        huertaId,
        cuadroIds,
        productoId,
        recursoTipo,
        equipoId: recursoTipo === "implemento" ? equipoId : undefined,
        concentracionValor: Number(concentracionValor),
        concentracionUnidad,
        litrosMezclaPorHa: Number(litrosMezclaPorHa),
        fechaInicio,
        fechaFin,
      });
      setMostrarForm(false);
      setCuadroIds([]);
      setProductoId("");
      setEquipoId("");
      setConcentracionValor("");
      setLitrosMezclaPorHa("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo programar la aplicación.");
    }
  }

  async function entregar(id: string) {
    setError(null);
    try {
      await api.post(`/aplicaciones/${id}/entregar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar la entrega.");
    }
  }

  async function liberar(id: string) {
    setError(null);
    try {
      await api.post(`/aplicaciones/${id}/liberar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo liberar.");
    }
  }

  async function abrirRegistrar(a: Aplicacion) {
    setRegistrando(a.id);
    setQuien("");
    setHoras("");
    setFechaReal(hoyISO());
    const grupos = await api.get<GrupoPago[]>(`/aplicaciones/grupos?huertaId=${a.huertaId}`);
    setGruposHuerta(grupos);
  }

  async function confirmarRegistrar(id: string) {
    setError(null);
    if (!quien) {
      setError("Falta quién hizo la aplicación.");
      return;
    }
    const [tipo, refId] = quien.split(":");
    try {
      await api.post(`/aplicaciones/${id}/realizada`, {
        personalId: tipo === "p" ? refId : undefined,
        grupoId: tipo === "g" ? refId : undefined,
        horas: Number(horas),
        fechaReal,
      });
      setRegistrando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Aplicaciones</h2>

      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Programar aplicación"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={programar} className="card" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="field">
              Huerta
              <select value={huertaId} onChange={(e) => { setHuertaId(e.target.value); setCuadroIds([]); }} required>
                <option value="">Selecciona…</option>
                {huertas.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Producto (agroquímico autorizado)
              <select value={productoId} onChange={(e) => setProductoId(e.target.value)} required>
                <option value="">Selecciona…</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombreComercial} ({p.presentacion})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {huertaId && (
            <div className="field">
              Cuadros
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {cuadrosHuerta.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--ink)" }}>
                    <input type="checkbox" checked={cuadroIds.includes(c.id)} onChange={() => alternarCuadro(c.id)} />
                    {c.nombre}
                  </label>
                ))}
                {cuadrosHuerta.length === 0 && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Esta Huerta no tiene Cuadros.</span>}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="field">
              Recurso
              <select value={recursoTipo} onChange={(e) => setRecursoTipo(e.target.value as RecursoTipo)}>
                <option value="gente">Con gente</option>
                <option value="implemento">Con implemento</option>
              </select>
            </label>
            {recursoTipo === "implemento" && (
              <label className="field">
                Equipo
                <select value={equipoId} onChange={(e) => setEquipoId(e.target.value)} required>
                  <option value="">Selecciona…</option>
                  {equiposImplemento.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.folio} {eq.marca ?? ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="field">
              Concentración
              <input type="number" step="0.0001" value={concentracionValor} onChange={(e) => setConcentracionValor(e.target.value)} required />
            </label>
            <label className="field">
              Unidad
              <select value={concentracionUnidad} onChange={(e) => setConcentracionUnidad(e.target.value as ConcentracionUnidad)}>
                <option value="ml_l">ml/L</option>
                <option value="g_l">g/L</option>
                <option value="kg_l">kg/L</option>
              </select>
            </label>
            <label className="field">
              Litros de mezcla / ha
              <input type="number" step="0.0001" value={litrosMezclaPorHa} onChange={(e) => setLitrosMezclaPorHa(e.target.value)} required />
            </label>
            <label className="field">
              Fecha inicio
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required />
            </label>
            <label className="field">
              Fecha fin
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} required />
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
          {aplicaciones.map((a) => (
            <div key={a.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span className={`tag ${tagEstado(a.estado)}`}>{ETIQUETAS_ESTADO[a.estado]}</span>{" "}
                  {!a.comprometido && a.estado === "programada" && <span className="tag tag-neutral">Esperando compra automática</span>}{" "}
                  {a.alertaVencimiento && <span className="tag tag-danger">15+ días sin entregar</span>}{" "}
                  {a.alertaPendienteAplicar && <span className="tag tag-danger">15+ días entregada sin aplicar</span>}
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
                    {a.huerta.nombre} — {a.producto.nombreComercial}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    Cuadros: {a.cuadros.map((c) => c.cuadro.nombre).join(", ") || "—"} · {formaEntero(a.cantidadTotalCalculada)} {a.producto.unidad}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {a.concentracionValor} {a.concentracionUnidad.replace("_", "/")} · {a.litrosMezclaPorHa} L mezcla/ha ·{" "}
                    {a.recursoTipo === "implemento" ? `Con implemento (${a.equipo?.folio ?? "—"})` : "Con gente"} · {a.fechaInicio.slice(0, 10)} a{" "}
                    {a.fechaFin.slice(0, 10)}
                  </div>
                  {a.realizadas.length > 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                      Horas registradas: {a.realizadas.reduce((s, r) => s + Number(r.horas), 0)} ({a.realizadas.length} reporte
                      {a.realizadas.length === 1 ? "" : "s"})
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {a.estado === "programada" && a.comprometido && (
                    <button className="btn-primary" onClick={() => entregar(a.id)}>
                      Confirmar entrega
                    </button>
                  )}
                  {a.estado === "programada" && (
                    <button className="btn-secondary" onClick={() => liberar(a.id)}>
                      Liberar
                    </button>
                  )}
                  {(a.estado === "entregada" || a.estado === "realizada") && registrando !== a.id && (
                    <button className="btn-primary" onClick={() => abrirRegistrar(a)}>
                      Registrar horas
                    </button>
                  )}
                </div>
              </div>

              {registrando === a.id && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <label className="field">
                      Quién la hizo
                      <select value={quien} onChange={(e) => setQuien(e.target.value)}>
                        <option value="">Selecciona…</option>
                        <optgroup label="Personal">
                          {personal.map((p) => (
                            <option key={p.id} value={`p:${p.id}`}>
                              {p.nombreCompleto}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Grupos">
                          {gruposHuerta.map((g) => (
                            <option key={g.id} value={`g:${g.id}`}>
                              {g.nombre ?? "(sin nombre)"}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </label>
                    <label className="field">
                      Horas
                      <input type="number" step="0.25" value={horas} onChange={(e) => setHoras(e.target.value)} />
                    </label>
                    <label className="field">
                      Fecha
                      <input type="date" value={fechaReal} onChange={(e) => setFechaReal(e.target.value)} />
                    </label>
                    <button className="btn-primary" onClick={() => confirmarRegistrar(a.id)}>
                      Guardar
                    </button>
                    <button className="btn-secondary" onClick={() => setRegistrando(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {aplicaciones.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay aplicaciones{usuario?.huertaId ? " en tu Huerta" : ""}.</p>}
        </div>
      )}
    </div>
  );
}
