import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import { useCuadros } from "../../lib/useCuadros";
import { useProductos } from "../../lib/useProductos";
import type {
  Ciclo,
  ViveroLote,
  ViveroLoteDetalle,
  ViveroPresupuestoSemilla,
  ViveroSobrevivenciaVariedad,
} from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";
import { formatearNumero } from "../../lib/numero";
import { nombreConMarca } from "../../lib/producto";

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Vivero() {
  const { huertas } = useHuertas();
  const [huertaId, setHuertaId] = useState("");
  const { cuadros } = useCuadros(huertaId);
  const { productos } = useProductos();

  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cargarCiclo() {
    if (!huertaId) {
      setCiclo(null);
      return;
    }
    api
      .get<Ciclo[]>(`/ciclos?huertaId=${huertaId}`)
      .then((ciclos) => setCiclo(ciclos.find((c) => c.activo) ?? null))
      .catch(() => setCiclo(null));
  }
  useEffect(cargarCiclo, [huertaId]);

  // Confirmar tipo/cavidades de charola del Ciclo (5.2) -- constante durante todo el Ciclo.
  const [tipoCharolaForm, setTipoCharolaForm] = useState("");
  const [cavidadesForm, setCavidadesForm] = useState("");

  async function guardarCharolaCiclo() {
    if (!ciclo) return;
    setError(null);
    try {
      await api.patch(`/vivero/ciclos/${ciclo.id}/charola`, { tipoCharola: tipoCharolaForm, cavidadesPorCharola: Number(cavidadesForm) });
      setTipoCharolaForm("");
      setCavidadesForm("");
      cargarCiclo();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  // Presupuesto de semilla (5.1)
  const [presupuestos, setPresupuestos] = useState<ViveroPresupuestoSemilla[]>([]);
  const [mostrarPresupuesto, setMostrarPresupuesto] = useState(false);
  const [presVariedad, setPresVariedad] = useState("");
  const [presProductoId, setPresProductoId] = useState("");
  const [presCantidad, setPresCantidad] = useState("");

  function cargarPresupuestos() {
    if (!ciclo) return;
    api.get<ViveroPresupuestoSemilla[]>(`/vivero/presupuesto-semilla?cicloId=${ciclo.id}`).then(setPresupuestos).catch(() => {});
  }
  useEffect(cargarPresupuestos, [ciclo]);

  async function crearPresupuesto(e: FormEvent) {
    e.preventDefault();
    if (!ciclo) return;
    setError(null);
    try {
      await api.post("/vivero/presupuesto-semilla", {
        cicloId: ciclo.id,
        variedad: presVariedad,
        productoId: presProductoId,
        cantidadNecesaria: Number(presCantidad),
      });
      setPresVariedad("");
      setPresProductoId("");
      setPresCantidad("");
      setMostrarPresupuesto(false);
      cargarPresupuestos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  // Lotes (5.3)
  const [lotes, setLotes] = useState<ViveroLote[]>([]);
  const [mostrarLoteForm, setMostrarLoteForm] = useState(false);
  const [loteVariedad, setLoteVariedad] = useState("");
  const [fechaRemojo, setFechaRemojo] = useState("");
  const [fechaCalentar, setFechaCalentar] = useState("");
  const [fechaSiembraCharolas, setFechaSiembraCharolas] = useState(hoyISO());
  const [fechaTapado, setFechaTapado] = useState("");
  const [fechaSalidaVivero, setFechaSalidaVivero] = useState("");

  function cargarLotes() {
    if (!ciclo) {
      setLotes([]);
      return;
    }
    api.get<ViveroLote[]>(`/vivero/lotes?cicloId=${ciclo.id}`).then(setLotes).catch(() => {});
  }
  useEffect(cargarLotes, [ciclo]);

  async function crearLote(e: FormEvent) {
    e.preventDefault();
    if (!ciclo) return;
    setError(null);
    try {
      await api.post("/vivero/lotes", {
        cicloId: ciclo.id,
        variedad: loteVariedad,
        fechaSiembraCharolas,
        fechaRemojo: fechaRemojo || undefined,
        fechaCalentar: fechaCalentar || undefined,
        fechaTapado: fechaTapado || undefined,
        fechaSalidaVivero: fechaSalidaVivero || undefined,
      });
      setLoteVariedad("");
      setFechaRemojo("");
      setFechaCalentar("");
      setFechaSiembraCharolas(hoyISO());
      setFechaTapado("");
      setFechaSalidaVivero("");
      setMostrarLoteForm(false);
      cargarLotes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  // Reporte de sobrevivencia (5.6)
  const [sobrevivencia, setSobrevivencia] = useState<ViveroSobrevivenciaVariedad[]>([]);
  function cargarSobrevivencia() {
    if (!ciclo) return;
    api.get<ViveroSobrevivenciaVariedad[]>(`/vivero/ciclos/${ciclo.id}/sobrevivencia`).then(setSobrevivencia).catch(() => {});
  }
  useEffect(cargarSobrevivencia, [ciclo, lotes]);

  // Detalle de un Lote expandido
  const [loteAbiertoId, setLoteAbiertoId] = useState<string | null>(null);
  const [detalleLote, setDetalleLote] = useState<ViveroLoteDetalle | null>(null);
  function cargarDetalle(loteId: string) {
    api.get<ViveroLoteDetalle>(`/vivero/lotes/${loteId}`).then(setDetalleLote).catch(() => {});
  }

  function toggleLote(loteId: string) {
    if (loteAbiertoId === loteId) {
      setLoteAbiertoId(null);
      setDetalleLote(null);
    } else {
      setLoteAbiertoId(loteId);
      cargarDetalle(loteId);
    }
  }

  function refrescarTodo() {
    cargarLotes();
    cargarSobrevivencia();
    if (loteAbiertoId) cargarDetalle(loteAbiertoId);
  }

  // Charolas dentro del detalle
  const [codigosNuevos, setCodigosNuevos] = useState("");
  async function agregarCharolas(loteId: string) {
    setError(null);
    const codigos = codigosNuevos
      .split(/[,\n]/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (codigos.length === 0) return;
    try {
      await api.post(`/vivero/lotes/${loteId}/charolas`, { codigos });
      setCodigosNuevos("");
      refrescarTodo();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  const [muertasForm, setMuertasForm] = useState<Record<string, string>>({});
  async function guardarMuertas(charolaId: string) {
    setError(null);
    try {
      await api.patch(`/vivero/charolas/${charolaId}/muertas`, { muertas: Number(muertasForm[charolaId] ?? 0), fecha: hoyISO() });
      refrescarTodo();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  async function registrarRiegoHoy(loteId: string) {
    setError(null);
    try {
      await api.post(`/vivero/lotes/${loteId}/riego`, { fecha: hoyISO() });
      refrescarTodo();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  // Traspaso a campo
  const [traspasoCantidad, setTraspasoCantidad] = useState("");
  const [traspasoCuadroId, setTraspasoCuadroId] = useState("");
  const [traspasoFecha, setTraspasoFecha] = useState(hoyISO());

  async function crearTraspaso(loteId: string) {
    setError(null);
    try {
      await api.post(`/vivero/lotes/${loteId}/traspasos`, {
        cantidadCharolas: Number(traspasoCantidad),
        huertaId,
        cuadroId: traspasoCuadroId || undefined,
        fecha: traspasoFecha,
      });
      setTraspasoCantidad("");
      setTraspasoCuadroId("");
      cargarDetalle(loteId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  const [conteoForm, setConteoForm] = useState<Record<string, { prendieron: string; murieron: string; fecha: string }>>({});
  async function registrarConteo(traspasoId: string, loteId: string) {
    setError(null);
    const f = conteoForm[traspasoId];
    if (!f) return;
    try {
      await api.post(`/vivero/traspasos/${traspasoId}/conteo`, {
        prendieron: Number(f.prendieron || 0),
        murieron: Number(f.murieron || 0),
        fecha: f.fecha || hoyISO(),
      });
      setConteoForm((prev) => ({ ...prev, [traspasoId]: { prendieron: "", murieron: "", fecha: hoyISO() } }));
      cargarDetalle(loteId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  const semillasCandidatas = productos.filter((p) => p.categoria.toLowerCase().includes("semilla"));

  return (
    <div>
      <label className="field" style={{ maxWidth: 280, marginBottom: 18 }}>
        Huerta
        <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)}>
          <option value="">Selecciona…</option>
          {huertas.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nombre}
            </option>
          ))}
        </select>
      </label>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {!huertaId && <p style={{ color: "var(--ink-soft)" }}>Selecciona una Huerta para ver su Vivero.</p>}
      {huertaId && !ciclo && <p style={{ color: "var(--ink-soft)" }}>Esta Huerta no tiene un Ciclo activo — Vivero depende de un Ciclo.</p>}

      {ciclo && !ciclo.cavidadesPorCharola && (
        <div className="card" style={{ marginBottom: 18, background: "var(--surface-warning, #fff8e6)" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Confirma el tipo de charola de este Ciclo</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
            Se define una sola vez al iniciar el Ciclo y queda constante todo el Ciclo — hace falta antes de dar de alta Lotes.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label className="field" style={{ maxWidth: 200 }}>
              Tipo de charola
              <input value={tipoCharolaForm} onChange={(e) => setTipoCharolaForm(e.target.value)} placeholder='Ej. "200 cavidades"' />
            </label>
            <label className="field" style={{ maxWidth: 140 }}>
              Cavidades
              <input type="number" min={1} step="1" value={cavidadesForm} onChange={(e) => setCavidadesForm(e.target.value)} />
            </label>
            <button className="btn-primary" onClick={guardarCharolaCiclo} disabled={!tipoCharolaForm || !cavidadesForm}>
              Confirmar
            </button>
          </div>
        </div>
      )}

      {ciclo && ciclo.cavidadesPorCharola && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="tag tag-neutral">{ciclo.tipoCharola}</span>{" "}
                <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{ciclo.cavidadesPorCharola} cavidades por charola</span>
              </div>
            </div>
          </div>

          {sobrevivencia.length > 0 && (
            <div className="card" style={{ marginBottom: 18 }}>
              <h3 style={{ marginBottom: 10 }}>% de sobrevivencia por Variedad</h3>
              <table>
                <thead>
                  <tr>
                    <th>Variedad</th>
                    <th>Cavidades totales</th>
                    <th>Vivas</th>
                    <th>Muertas</th>
                    <th>% Sobrevivencia</th>
                  </tr>
                </thead>
                <tbody>
                  {sobrevivencia.map((s) => (
                    <tr key={s.variedad}>
                      <td>{s.variedad}</td>
                      <td>{formatearNumero(s.cavidadesTotales)}</td>
                      <td>{formatearNumero(s.vivas)}</td>
                      <td>{formatearNumero(s.muertas)}</td>
                      <td>{s.porcentajeSobrevivencia.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card" style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3>Presupuesto de semilla</h3>
              <button className="btn-secondary" onClick={() => setMostrarPresupuesto((v) => !v)}>
                {mostrarPresupuesto ? "Cancelar" : "+ Nuevo"}
              </button>
            </div>
            {mostrarPresupuesto && (
              <form onSubmit={crearPresupuesto} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
                <label className="field" style={{ maxWidth: 160 }}>
                  Variedad
                  <input value={presVariedad} onChange={(e) => setPresVariedad(e.target.value)} required />
                </label>
                <label className="field" style={{ maxWidth: 260 }}>
                  Semilla (catálogo de Almacén)
                  <select value={presProductoId} onChange={(e) => setPresProductoId(e.target.value)} required>
                    <option value="">Selecciona…</option>
                    {(semillasCandidatas.length > 0 ? semillasCandidatas : productos).map((p) => (
                      <option key={p.id} value={p.id}>
                        {nombreConMarca(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" style={{ maxWidth: 120 }}>
                  Cantidad
                  <input type="number" min={0} step="0.001" value={presCantidad} onChange={(e) => setPresCantidad(e.target.value)} required />
                </label>
                <button className="btn-primary" type="submit">
                  Guardar
                </button>
              </form>
            )}
            <table>
              <thead>
                <tr>
                  <th>Variedad</th>
                  <th>Semilla</th>
                  <th>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {presupuestos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.variedad}</td>
                    <td>{nombreConMarca(p.producto)}</td>
                    <td>{formatearNumero(Number(p.cantidadNecesaria))}</td>
                  </tr>
                ))}
                {presupuestos.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ color: "var(--ink-soft)" }}>
                      Sin presupuesto capturado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3>Lotes de siembra</h3>
              <button className="btn-secondary" onClick={() => setMostrarLoteForm((v) => !v)}>
                {mostrarLoteForm ? "Cancelar" : "+ Nuevo Lote"}
              </button>
            </div>

            {mostrarLoteForm && (
              <form onSubmit={crearLote} style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="field" style={{ maxWidth: 160 }}>
                  Variedad
                  <input value={loteVariedad} onChange={(e) => setLoteVariedad(e.target.value)} required />
                </label>
                <label className="field" style={{ maxWidth: 150 }}>
                  Remojo de semilla
                  <FechaInput value={fechaRemojo} onChange={setFechaRemojo} />
                </label>
                <label className="field" style={{ maxWidth: 150 }}>
                  Puesta a calentar
                  <FechaInput value={fechaCalentar} onChange={setFechaCalentar} />
                </label>
                <label className="field" style={{ maxWidth: 150 }}>
                  Siembra en charolas
                  <FechaInput value={fechaSiembraCharolas} onChange={setFechaSiembraCharolas} required />
                </label>
                <label className="field" style={{ maxWidth: 150 }}>
                  Tapado
                  <FechaInput value={fechaTapado} onChange={setFechaTapado} />
                </label>
                <label className="field" style={{ maxWidth: 150 }}>
                  Salida al vivero
                  <FechaInput value={fechaSalidaVivero} onChange={setFechaSalidaVivero} />
                </label>
                <button className="btn-primary" type="submit">
                  Crear Lote
                </button>
              </form>
            )}

            <table>
              <thead>
                <tr>
                  <th>Variedad</th>
                  <th>Siembra en charolas</th>
                  <th>Charolas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((l) => (
                  <tr key={l.id}>
                    <td>{l.variedad}</td>
                    <td>{formatearFecha(l.fechaSiembraCharolas)}</td>
                    <td>{l.charolas.length}</td>
                    <td>
                      <button className="btn-secondary" onClick={() => toggleLote(l.id)}>
                        {loteAbiertoId === l.id ? "Cerrar" : "Ver detalle"}
                      </button>
                    </td>
                  </tr>
                ))}
                {lotes.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--ink-soft)" }}>
                      Sin Lotes capturados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {loteAbiertoId && detalleLote && (
              <div className="card" style={{ marginTop: 14, background: "var(--surface-soft, #fafafa)" }}>
                <h4 style={{ marginBottom: 8 }}>
                  Lote {detalleLote.variedad} — 5 fechas
                </h4>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <span>Remojo: {formatearFecha(detalleLote.fechaRemojo)}</span>
                  <span>Calentar: {formatearFecha(detalleLote.fechaCalentar)}</span>
                  <span>Siembra: {formatearFecha(detalleLote.fechaSiembraCharolas)}</span>
                  <span>Tapado: {formatearFecha(detalleLote.fechaTapado)}</span>
                  <span>Salida al vivero: {formatearFecha(detalleLote.fechaSalidaVivero)}</span>
                </div>

                <h5 style={{ marginBottom: 6 }}>Charolas</h5>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input
                    placeholder="Códigos separados por coma (ej. CH-1, CH-2)"
                    style={{ flex: 1 }}
                    value={codigosNuevos}
                    onChange={(e) => setCodigosNuevos(e.target.value)}
                  />
                  <button className="btn-secondary" onClick={() => agregarCharolas(detalleLote.id)}>
                    + Agregar charolas
                  </button>
                </div>
                <table style={{ marginBottom: 16 }}>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Muertas</th>
                      <th>Vivas</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleLote.charolas.map((c) => (
                      <tr key={c.id}>
                        <td>{c.codigo}</td>
                        <td style={{ width: 90 }}>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            style={{ width: 70 }}
                            value={muertasForm[c.id] ?? String(c.muertas)}
                            onChange={(e) => setMuertasForm((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          />
                        </td>
                        <td>{(ciclo.cavidadesPorCharola ?? 0) - Number(muertasForm[c.id] ?? c.muertas)}</td>
                        <td>
                          <button className="btn-secondary" onClick={() => guardarMuertas(c.id)}>
                            Guardar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h5 style={{ marginBottom: 6 }}>Riego (sin cálculo de litros)</h5>
                <div style={{ marginBottom: 16 }}>
                  <button className="btn-secondary" onClick={() => registrarRiegoHoy(detalleLote.id)}>
                    Registrar riego de hoy ({hoyISO()})
                  </button>{" "}
                  <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{detalleLote.riegos.length} días regados en total.</span>
                </div>

                <h5 style={{ marginBottom: 6 }}>Traspaso a campo / Resiembra</h5>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
                  <label className="field" style={{ maxWidth: 120 }}>
                    Charolas
                    <input type="number" min={1} step="1" value={traspasoCantidad} onChange={(e) => setTraspasoCantidad(e.target.value)} />
                  </label>
                  <label className="field" style={{ maxWidth: 200 }}>
                    Cuadro destino
                    <select value={traspasoCuadroId} onChange={(e) => setTraspasoCuadroId(e.target.value)}>
                      <option value="">(sin especificar)</option>
                      {cuadros.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field" style={{ maxWidth: 150 }}>
                    Fecha
                    <FechaInput value={traspasoFecha} onChange={setTraspasoFecha} />
                  </label>
                  <button className="btn-primary" onClick={() => crearTraspaso(detalleLote.id)} disabled={!traspasoCantidad}>
                    Registrar traspaso
                  </button>
                </div>

                {detalleLote.traspasos.map((t) => (
                  <div key={t.id} className="card" style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12.5, marginBottom: 6 }}>
                      {t.cantidadCharolas} charolas → {t.huerta.nombre}
                      {t.cuadro ? ` / ${t.cuadro.nombre}` : ""} — {formatearFecha(t.fecha)}
                    </div>
                    {t.conteos.map((c) => (
                      <div key={c.id} style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                        Conteo {formatearFecha(c.fecha)}: {c.prendieron} prendieron, {c.murieron} murieron
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginTop: 6, flexWrap: "wrap" }}>
                      <label className="field" style={{ maxWidth: 100 }}>
                        Prendieron
                        <input
                          type="number"
                          min={0}
                          value={conteoForm[t.id]?.prendieron ?? ""}
                          onChange={(e) =>
                            setConteoForm((prev) => ({ ...prev, [t.id]: { ...(prev[t.id] ?? { prendieron: "", murieron: "", fecha: hoyISO() }), prendieron: e.target.value } }))
                          }
                        />
                      </label>
                      <label className="field" style={{ maxWidth: 100 }}>
                        Murieron
                        <input
                          type="number"
                          min={0}
                          value={conteoForm[t.id]?.murieron ?? ""}
                          onChange={(e) =>
                            setConteoForm((prev) => ({ ...prev, [t.id]: { ...(prev[t.id] ?? { prendieron: "", murieron: "", fecha: hoyISO() }), murieron: e.target.value } }))
                          }
                        />
                      </label>
                      <button className="btn-secondary" onClick={() => registrarConteo(t.id, detalleLote.id)}>
                        Guardar conteo
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
