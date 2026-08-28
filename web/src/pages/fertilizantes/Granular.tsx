import { Fragment, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import { usePersonal } from "../../lib/usePersonal";
import type { Cuadro, Equipo, FertilizacionGranular, GrupoPago, ModoDosisGranular, Producto, RecursoTipo } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha, formatearInstante } from "../../lib/fecha";
import { formatearNumero } from "../../lib/numero";
import { presentacionTexto } from "../../lib/producto";

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
  const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface ProductoGranularForm {
  productoId: string;
  modoDosis: ModoDosisGranular;
  dosisValor: string;
}

function productoGranularFormVacio(): ProductoGranularForm {
  return { productoId: "", modoDosis: "kg_ha", dosisValor: "" };
}

export default function Granular() {
  const { huertas } = useHuertas();
  const { personal } = usePersonal();

  const [lista, setLista] = useState<FertilizacionGranular[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [equiposImplemento, setEquiposImplemento] = useState<Equipo[]>([]);
  const [huertaId, setHuertaId] = useState("");
  const [cuadrosHuerta, setCuadrosHuerta] = useState<Cuadro[]>([]);
  const [cuadroIds, setCuadroIds] = useState<string[]>([]);
  // Varios productos revueltos antes de esparcir (10-ago-2026): cada uno
  // con su propia dosis independiente — a diferencia de Aplicaciones, aquí
  // no hay "litros de mezcla" compartido.
  const [productosForm, setProductosForm] = useState<ProductoGranularForm[]>([productoGranularFormVacio()]);
  const [recursoTipo, setRecursoTipo] = useState<RecursoTipo>("gente");
  const [equipoId, setEquipoId] = useState("");
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState(hoyISO());
  // Editar Paso 1 (15-ago-2026): solo mientras no haya reportes de avance —
  // mismo criterio que Aplicaciones (9.7).
  const [editandoProgramadaId, setEditandoProgramadaId] = useState<string | null>(null);

  const [registrando, setRegistrando] = useState<string | null>(null);
  const [gruposHuerta, setGruposHuerta] = useState<GrupoPago[]>([]);
  const [quien, setQuien] = useState("");
  const [horas, setHoras] = useState("");
  const [fechaReal, setFechaReal] = useState(hoyISO());
  const [avanceCuadros, setAvanceCuadros] = useState<Record<string, string>>({});

  const [editando, setEditando] = useState<string | null>(null);
  const [editQuien, setEditQuien] = useState("");
  const [editHoras, setEditHoras] = useState("");
  const [editAvanceCuadros, setEditAvanceCuadros] = useState<Record<string, string>>({});

  function cargar() {
    setCargando(true);
    api
      .get<FertilizacionGranular[]>("/fertilizantes/granular")
      .then(setLista)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  useEffect(() => {
    api.get<Producto[]>("/fertilizantes/granular/productos").then(setProductos);
    api.get<Equipo[]>("/fertilizantes/granular/equipos-implemento").then(setEquiposImplemento);
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

  // Atajo "toda la Huerta" (16-ago-2026): mismo cuadroIds que marcar cada
  // Cuadro a mano — no cambia ninguna lógica de negocio.
  function alternarTodaLaHuerta() {
    setCuadroIds((prev) => (prev.length === cuadrosHuerta.length ? [] : cuadrosHuerta.map((c) => c.id)));
  }

  function actualizarProductoForm(index: number, cambios: Partial<ProductoGranularForm>) {
    setProductosForm((prev) => prev.map((p, i) => (i !== index ? p : { ...p, ...cambios })));
  }

  function agregarProductoForm() {
    setProductosForm((prev) => [...prev, productoGranularFormVacio()]);
  }

  function quitarProductoForm(index: number) {
    setProductosForm((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function programar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      cuadroIds,
      productos: productosForm.map((p) => ({ productoId: p.productoId, modoDosis: p.modoDosis, dosisValor: Number(p.dosisValor) })),
      recursoTipo,
      equipoId: recursoTipo === "implemento" ? equipoId : undefined,
      fechaInicio,
      fechaFin,
    };
    try {
      if (editandoProgramadaId) {
        await api.patch(`/fertilizantes/granular/${editandoProgramadaId}`, payload);
      } else {
        await api.post("/fertilizantes/granular", { huertaId, ...payload });
      }
      setMostrarForm(false);
      setEditandoProgramadaId(null);
      setCuadroIds([]);
      setProductosForm([productoGranularFormVacio()]);
      setEquipoId("");
      setFechaInicio(hoyISO());
      setFechaFin(hoyISO());
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la fertilización.");
    }
  }

  function iniciarEdicionProgramada(f: FertilizacionGranular) {
    setEditandoProgramadaId(f.id);
    setHuertaId(f.huertaId);
    setCuadroIds(f.cuadros.map((c) => c.cuadro.id));
    setProductosForm(f.productos.map((p) => ({ productoId: p.productoId, modoDosis: p.modoDosis, dosisValor: String(p.dosisValor) })));
    setRecursoTipo(f.recursoTipo);
    setEquipoId(f.equipoId ?? "");
    setFechaInicio(f.fechaInicio.slice(0, 10));
    setFechaFin(f.fechaFin.slice(0, 10));
    setError(null);
    setMostrarForm(true);
  }

  async function entregar(id: string) {
    setError(null);
    try {
      await api.post(`/fertilizantes/granular/${id}/entregar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar la entrega.");
    }
  }

  async function liberar(id: string) {
    setError(null);
    try {
      await api.post(`/fertilizantes/granular/${id}/liberar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo liberar.");
    }
  }

  // Precarga (9.5, 10-ago-2026): el reporte de un nuevo día se pre-llena con
  // quién y cuántas horas del reporte anterior de esta misma Fertilización
  // — el Supervisor solo ajusta lo que cambió, sin afectar días anteriores.
  async function abrirRegistrar(f: FertilizacionGranular) {
    setRegistrando(f.id);
    const ultimo = f.realizadas[0];
    setQuien(ultimo ? (ultimo.personalId ? `p:${ultimo.personalId}` : ultimo.grupoId ? `g:${ultimo.grupoId}` : "") : "");
    setHoras(ultimo ? ultimo.horas : "");
    setFechaReal(hoyISO());
    setAvanceCuadros({});
    const grupos = await api.get<GrupoPago[]>("/fertilizantes/granular/grupos");
    setGruposHuerta(grupos);
  }

  function cuadrosDesdeMapa(mapa: Record<string, string>) {
    return Object.entries(mapa)
      .filter(([, hectareas]) => hectareas)
      .map(([cuadroId, hectareas]) => ({ cuadroId, hectareas: Number(hectareas) }));
  }

  async function confirmarRegistrar(id: string) {
    setError(null);
    if (!quien) {
      setError("Falta quién hizo la fertilización.");
      return;
    }
    const cuadros = cuadrosDesdeMapa(avanceCuadros);
    if (cuadros.length === 0) {
      setError("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");
      return;
    }
    const [tipo, refId] = quien.split(":");
    try {
      await api.post(`/fertilizantes/granular/${id}/realizada`, {
        personalId: tipo === "p" ? refId : undefined,
        grupoId: tipo === "g" ? refId : undefined,
        horas: Number(horas),
        fechaReal,
        cuadros,
      });
      setRegistrando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    }
  }

  function abrirEditar(r: FertilizacionGranular["realizadas"][number]) {
    setEditando(r.id);
    setEditQuien(r.personalId ? `p:${r.personalId}` : r.grupoId ? `g:${r.grupoId}` : "");
    setEditHoras(r.horas);
    const mapa: Record<string, string> = {};
    for (const c of r.cuadros) mapa[c.cuadroId] = c.hectareas;
    setEditAvanceCuadros(mapa);
  }

  async function confirmarEditar(realizadaId: string) {
    setError(null);
    if (!editQuien) {
      setError("Falta quién hizo la fertilización.");
      return;
    }
    const cuadros = cuadrosDesdeMapa(editAvanceCuadros);
    if (cuadros.length === 0) {
      setError("Falta capturar qué Cuadro(s) se avanzaron y sus hectáreas en este reporte.");
      return;
    }
    const [tipo, refId] = editQuien.split(":");
    try {
      await api.patch(`/fertilizantes/granular/realizada/${realizadaId}`, {
        personalId: tipo === "p" ? refId : undefined,
        grupoId: tipo === "g" ? refId : undefined,
        horas: Number(editHoras),
        cuadros,
      });
      setEditando(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la edición.");
    }
  }

  async function cancelar(id: string) {
    if (!confirm("¿Cancelar esta fertilización? Se regresará a bodega central el producto no aplicado y se generará un abono al Rancho.")) return;
    setError(null);
    try {
      await api.post(`/fertilizantes/granular/${id}/cancelar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cancelar.");
    }
  }

  async function confirmarRecepcion(id: string) {
    setError(null);
    try {
      await api.post(`/fertilizantes/granular/${id}/confirmar-recepcion-cancelacion`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button
          className="btn-primary"
          onClick={() => {
            if (mostrarForm) {
              setEditandoProgramadaId(null);
              setCuadroIds([]);
              setProductosForm([productoGranularFormVacio()]);
              setEquipoId("");
            }
            setMostrarForm((v) => !v);
          }}
        >
          {mostrarForm ? "Cancelar" : "+ Programar fertilización"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={programar} className="card" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="field">
              Huerta
              <select
                value={huertaId}
                onChange={(e) => { setHuertaId(e.target.value); setCuadroIds([]); }}
                required
                disabled={!!editandoProgramadaId}
              >
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
              Cuadros
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {cuadrosHuerta.length > 0 && (
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
                    <input type="checkbox" checked={cuadroIds.length === cuadrosHuerta.length} onChange={alternarTodaLaHuerta} />
                    Toda la Huerta
                  </label>
                )}
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

          <div className="field">
            Productos (se revuelven antes de esparcir — cada uno con su propia dosis)
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
                    Modo de dosis
                    <select value={p.modoDosis} onChange={(e) => actualizarProductoForm(i, { modoDosis: e.target.value as ModoDosisGranular })}>
                      <option value="kg_ha">kg/hectárea</option>
                      <option value="g_planta">g/planta</option>
                    </select>
                  </label>
                  <label className="field">
                    Dosis ({p.modoDosis === "kg_ha" ? "kg/ha" : "g/planta"})
                    <input
                      type="number"
                      step="0.0001"
                      style={{ width: 100 }}
                      value={p.dosisValor}
                      onChange={(e) => actualizarProductoForm(i, { dosisValor: e.target.value })}
                      required
                    />
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
              Fecha inicio
              <FechaInput value={fechaInicio} onChange={setFechaInicio} required />
            </label>
            <label className="field">
              Fecha fin
              <FechaInput value={fechaFin} onChange={setFechaFin} required />
            </label>
            <button className="btn-primary" type="submit">
              {editandoProgramadaId ? "Guardar cambios" : "Programar"}
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
                  {f.alertaVencimiento && <span className="tag tag-danger">15+ días sin entregar</span>}{" "}
                  {f.alertaPendienteAplicar && <span className="tag tag-danger">15+ días entregada sin aplicar</span>}
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
                    {f.huerta.nombre} — {f.productos.map((p) => p.producto.nombreComercial).join(" + ")}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    Cuadros: {f.cuadros.map((c) => c.cuadro.nombre).join(", ") || "—"}
                  </div>
                  {f.productos.map((p) => (
                    <div key={p.id} style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      {p.producto.nombreComercial}: {formatearNumero(p.cantidadTotalCalculada)} {p.producto.unidad} · {p.dosisValor}{" "}
                      {p.modoDosis === "kg_ha" ? "kg/ha" : "g/planta"}
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    {f.recursoTipo === "implemento" ? `Con implemento (${f.equipo?.folio ?? "—"})` : "Con gente"} · {formatearFecha(f.fechaInicio)} a{" "}
                    {formatearFecha(f.fechaFin)}
                  </div>
                  {f.realizadas.length > 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                      {(f.porcentajeAvance ?? 0).toFixed(1)}% avance · {f.horasHombreTotales ?? 0} horas-hombre totales · {f.realizadas.length}{" "}
                      reporte{f.realizadas.length === 1 ? "" : "s"}
                    </div>
                  )}
                  {f.estado === "cancelada" && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                      Cancelada el {formatearInstante(f.fechaCancelacion)}
                      {f.confirmacionBodegaPorId
                        ? ` · Bodega confirmó recepción el ${formatearInstante(f.fechaConfirmacionBodega)}`
                        : " · Pendiente de confirmación de Bodega"}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(f.estado === "programada" || f.estado === "entregada") && f.realizadas.length === 0 && (
                    <button className="btn-secondary" onClick={() => iniciarEdicionProgramada(f)}>
                      Editar
                    </button>
                  )}
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
                  {(f.estado === "entregada" || f.estado === "realizada") && registrando !== f.id && (
                    <button className="btn-primary" onClick={() => abrirRegistrar(f)}>
                      Registrar avance
                    </button>
                  )}
                  {(f.estado === "entregada" || f.estado === "realizada") && f.alertaPendienteAplicar && (
                    <button className="btn-danger" onClick={() => cancelar(f.id)}>
                      Cancelar (15+ días sin terminar)
                    </button>
                  )}
                  {f.estado === "cancelada" && !f.confirmacionBodegaPorId && (
                    <button className="btn-primary" onClick={() => confirmarRecepcion(f.id)}>
                      Bodega: confirmar recepción
                    </button>
                  )}
                </div>
              </div>

              {registrando === f.id && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
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
                      <FechaInput value={fechaReal} onChange={setFechaReal} />
                    </label>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 6 }}>
                    ¿Qué Cuadro(s) se avanzaron en este reporte, y cuántas hectáreas de cada uno?
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    {f.cuadros.map(({ cuadro }) => (
                      <label key={cuadro.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                        <input
                          type="checkbox"
                          checked={avanceCuadros[cuadro.id] !== undefined}
                          onChange={(e) =>
                            setAvanceCuadros((prev) => {
                              const copia = { ...prev };
                              if (e.target.checked) copia[cuadro.id] = "";
                              else delete copia[cuadro.id];
                              return copia;
                            })
                          }
                        />
                        {cuadro.nombre}
                        {avanceCuadros[cuadro.id] !== undefined && (
                          <input
                            type="number"
                            min={0}
                            step="0.0001"
                            placeholder="ha"
                            style={{ width: 80 }}
                            value={avanceCuadros[cuadro.id]}
                            onChange={(e) => setAvanceCuadros((prev) => ({ ...prev, [cuadro.id]: e.target.value }))}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" onClick={() => confirmarRegistrar(f.id)}>
                      Guardar
                    </button>
                    <button className="btn-secondary" onClick={() => setRegistrando(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {f.realizadas.length > 0 && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Historial de reportes</div>
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Horas</th>
                        <th>Cuadros avanzados</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.realizadas.map((r) => (
                        <Fragment key={r.id}>
                          <tr>
                            <td>{formatearFecha(r.fechaReal)}</td>
                            <td>{r.horas}</td>
                            <td>{r.cuadros.map((c) => `${c.cuadro.nombre} (${c.hectareas} ha)`).join(", ") || "—"}</td>
                            <td>
                              {editando !== r.id && (
                                <button className="btn-secondary" onClick={() => abrirEditar(r)}>
                                  Editar
                                </button>
                              )}
                            </td>
                          </tr>
                          {editando === r.id && (
                            <tr>
                              <td colSpan={4}>
                                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
                                  <label className="field">
                                    Quién la hizo
                                    <select value={editQuien} onChange={(e) => setEditQuien(e.target.value)}>
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
                                    <input type="number" step="0.25" value={editHoras} onChange={(e) => setEditHoras(e.target.value)} />
                                  </label>
                                </div>
                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                                  {f.cuadros.map(({ cuadro }) => (
                                    <label key={cuadro.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                                      <input
                                        type="checkbox"
                                        checked={editAvanceCuadros[cuadro.id] !== undefined}
                                        onChange={(e) =>
                                          setEditAvanceCuadros((prev) => {
                                            const copia = { ...prev };
                                            if (e.target.checked) copia[cuadro.id] = "";
                                            else delete copia[cuadro.id];
                                            return copia;
                                          })
                                        }
                                      />
                                      {cuadro.nombre}
                                      {editAvanceCuadros[cuadro.id] !== undefined && (
                                        <input
                                          type="number"
                                          min={0}
                                          step="0.0001"
                                          placeholder="ha"
                                          style={{ width: 80 }}
                                          value={editAvanceCuadros[cuadro.id]}
                                          onChange={(e) => setEditAvanceCuadros((prev) => ({ ...prev, [cuadro.id]: e.target.value }))}
                                        />
                                      )}
                                    </label>
                                  ))}
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button className="btn-primary" onClick={() => confirmarEditar(r.id)}>
                                    Guardar cambios
                                  </button>
                                  <button className="btn-secondary" onClick={() => setEditando(null)}>
                                    Cancelar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {lista.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay fertilizaciones granulares.</p>}
        </div>
      )}
    </div>
  );
}
