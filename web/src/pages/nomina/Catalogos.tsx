import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import { usePersonal } from "../../lib/usePersonal";
import type { Actividad, ConfigNomina, EsquemaPago, GrupoPago } from "../../lib/types";

const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const UNIDADES = ["hora", "dia", "surco", "planta", "remolque", "caja", "cuadro", "kg", "ha"];
const ESQUEMAS: { value: EsquemaPago; label: string }[] = [
  { value: "individual_hora", label: "Individual por hora" },
  { value: "individual_caja", label: "Individual por caja" },
  { value: "grupal_remolque", label: "Grupal por remolque" },
  { value: "depende_empacadores", label: "Depende de Empacadores" },
];

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Catalogos() {
  const { huertas } = useHuertas();
  const { personal } = usePersonal();

  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [config, setConfig] = useState<ConfigNomina | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [unidad, setUnidad] = useState("hora");
  const [esquemaPago, setEsquemaPago] = useState<EsquemaPago>("individual_hora");
  const [usarTarifaGeneral, setUsarTarifaGeneral] = useState(true);
  const [tarifa, setTarifa] = useState("0");
  const [requiereCuadro, setRequiereCuadro] = useState(false);

  const [tarifaGeneral, setTarifaGeneral] = useState("");
  const [diaCorte, setDiaCorte] = useState("jueves");
  const [diasGracia, setDiasGracia] = useState("3");

  const [huertaGrupos, setHuertaGrupos] = useState("");
  const [grupos, setGrupos] = useState<GrupoPago[]>([]);
  const [mostrarFormGrupo, setMostrarFormGrupo] = useState(false);
  const [nombreGrupo, setNombreGrupo] = useState("");
  const [persistenteGrupo, setPersistenteGrupo] = useState(true);
  const [miembrosGrupo, setMiembrosGrupo] = useState<string[]>([]);
  const [agregarA, setAgregarA] = useState<Record<string, string>>({});

  function cargar() {
    api.get<Actividad[]>("/nomina/actividades?todas=true").then(setActividades);
    api.get<ConfigNomina>("/nomina/config").then((c) => {
      setConfig(c);
      setTarifaGeneral(c.tarifaGeneralHora != null ? String(c.tarifaGeneralHora) : "");
      setDiaCorte(c.diaCorteSemanal);
      setDiasGracia(String(c.diasGraciaCierre));
    });
  }

  useEffect(cargar, []);

  useEffect(() => {
    if (!huertaGrupos && huertas.length > 0) setHuertaGrupos(huertas[0]!.id);
  }, [huertas, huertaGrupos]);

  function cargarGrupos() {
    if (!huertaGrupos) return;
    api.get<GrupoPago[]>(`/nomina/grupos?huertaId=${huertaGrupos}&fecha=${hoyISO()}`).then(setGrupos);
  }

  useEffect(cargarGrupos, [huertaGrupos]);

  async function crearActividad(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    try {
      const r = await api.post<{ mensaje?: string }>("/nomina/actividades", {
        nombre,
        unidad,
        esquemaPago,
        usarTarifaGeneral,
        tarifa: Number(tarifa),
        requiereCuadro,
      });
      setMensaje(r.mensaje ?? "Actividad creada.");
      setNombre("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la actividad.");
    }
  }

  async function toggleActivoActividad(a: Actividad) {
    setError(null);
    try {
      await api.patch(`/nomina/actividades/${a.id}/activo`, { activo: !a.activo });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar.");
    }
  }

  async function guardarConfig(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    try {
      await api.put("/nomina/config", {
        diaCorteSemanal: diaCorte,
        diasGraciaCierre: Number(diasGracia),
        tarifaGeneralHora: tarifaGeneral === "" ? undefined : Number(tarifaGeneral),
      });
      setMensaje("Configuración guardada.");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la configuración.");
    }
  }

  function alternarMiembroNuevo(personalId: string) {
    setMiembrosGrupo((prev) => (prev.includes(personalId) ? prev.filter((p) => p !== personalId) : [...prev, personalId]));
  }

  async function crearGrupo(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/nomina/grupos", {
        huertaId: huertaGrupos,
        nombre: nombreGrupo || undefined,
        persistente: persistenteGrupo,
        fecha: hoyISO(),
        miembros: miembrosGrupo,
      });
      setNombreGrupo("");
      setMiembrosGrupo([]);
      setMostrarFormGrupo(false);
      cargarGrupos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el grupo.");
    }
  }

  async function agregarMiembro(grupoId: string) {
    const personalId = agregarA[grupoId];
    if (!personalId) return;
    setError(null);
    try {
      await api.post(`/nomina/grupos/${grupoId}/miembros`, { personalId, fecha: hoyISO() });
      setAgregarA((prev) => ({ ...prev, [grupoId]: "" }));
      cargarGrupos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar.");
    }
  }

  async function quitarMiembro(grupoId: string, personalId: string) {
    setError(null);
    try {
      await api.delete(`/nomina/grupos/${grupoId}/miembros/${personalId}?fecha=${hoyISO()}`);
      cargarGrupos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo quitar.");
    }
  }

  async function borrarGrupo(grupoId: string) {
    if (!confirm("¿Borrar este grupo? Solo se puede si nunca se usó en una captura.")) return;
    setError(null);
    try {
      await api.delete(`/nomina/grupos/${grupoId}`);
      cargarGrupos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 380px" }}>
          <h3 style={{ marginBottom: 10 }}>Configuración de Nómina</h3>
          <form onSubmit={guardarConfig} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="field">
              Día de corte semanal
              <select value={diaCorte} onChange={(e) => setDiaCorte(e.target.value)}>
                {DIAS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Días de gracia para cerrar
              <input type="number" min={0} value={diasGracia} onChange={(e) => setDiasGracia(e.target.value)} />
            </label>
            <label className="field">
              Tarifa general por hora
              <input type="number" step="0.01" value={tarifaGeneral} onChange={(e) => setTarifaGeneral(e.target.value)} placeholder="Sin configurar" />
            </label>
            {config?.tarifaGeneralHora == null && (
              <div style={{ fontSize: 11, color: "var(--warning)" }}>
                Sin tarifa general configurada — las actividades que la usan no se pueden pagar hasta que la definas.
              </div>
            )}
            <button className="btn-primary" type="submit">
              Guardar configuración
            </button>
          </form>
        </div>

        <div style={{ flex: "2 1 480px" }}>
          <h3 style={{ marginBottom: 10 }}>Actividades</h3>
          <form onSubmit={crearActividad} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
            <label className="field">
              Nombre
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </label>
            <label className="field">
              Unidad
              <select value={unidad} onChange={(e) => setUnidad(e.target.value)}>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Esquema de pago
              <select value={esquemaPago} onChange={(e) => setEsquemaPago(e.target.value as EsquemaPago)}>
                {ESQUEMAS.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={usarTarifaGeneral} onChange={(e) => setUsarTarifaGeneral(e.target.checked)} />
              Usar tarifa general
            </label>
            {!usarTarifaGeneral && (
              <label className="field">
                Tarifa
                <input type="number" step="0.01" value={tarifa} onChange={(e) => setTarifa(e.target.value)} />
              </label>
            )}
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={requiereCuadro} onChange={(e) => setRequiereCuadro(e.target.checked)} />
              Requiere Cuadro
            </label>
            <button className="btn-primary" type="submit">
              + Nueva actividad
            </button>
          </form>

          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Unidad</th>
                <th>Esquema</th>
                <th>Tarifa</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {actividades.map((a) => (
                <tr key={a.id}>
                  <td>{a.nombre}</td>
                  <td>{a.unidad}</td>
                  <td>{a.esquemaPago}</td>
                  <td>{a.usarTarifaGeneral ? "General" : `$${a.tarifa}`}</td>
                  <td>
                    <span className={`tag ${a.activo ? "tag-success" : "tag-danger"}`}>{a.activo ? "Activa" : "Inactiva"}</span>
                  </td>
                  <td>
                    <button className="btn-secondary" onClick={() => toggleActivoActividad(a)}>
                      {a.activo ? "Desactivar" : "Reactivar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <h3>Grupos de pago (cuadrillas)</h3>
            <label className="field" style={{ maxWidth: 220 }}>
              Huerta
              <select value={huertaGrupos} onChange={(e) => setHuertaGrupos(e.target.value)}>
                {huertas.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="btn-primary" onClick={() => setMostrarFormGrupo((v) => !v)}>
            {mostrarFormGrupo ? "Cancelar" : "+ Nuevo grupo"}
          </button>
        </div>

        {mostrarFormGrupo && (
          <form onSubmit={crearGrupo} className="card" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label className="field">
                Nombre (opcional — vacío si es armado del día, sin nombre fijo)
                <input value={nombreGrupo} onChange={(e) => setNombreGrupo(e.target.value)} placeholder="Corte G1" />
              </label>
              <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={persistenteGrupo} onChange={(e) => setPersistenteGrupo(e.target.checked)} />
                Persistente (se reutiliza semana a semana)
              </label>
            </div>
            <div className="field">
              Miembros iniciales
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxHeight: 160, overflowY: "auto", marginTop: 4 }}>
                {personal.map((p) => (
                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--ink)" }}>
                    <input type="checkbox" checked={miembrosGrupo.includes(p.id)} onChange={() => alternarMiembroNuevo(p.id)} />
                    {p.nombreCompleto}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <button className="btn-primary" type="submit" disabled={miembrosGrupo.length === 0}>
                Guardar
              </button>
            </div>
          </form>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {grupos.map((g) => (
            <div key={g.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span className="tag tag-neutral">{g.persistente ? "Persistente" : "Del día"}</span>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{g.nombre ?? "(sin nombre)"}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                    {(g.miembrosHoy ?? []).map((personalId) => {
                      const p = personal.find((x) => x.id === personalId);
                      return (
                        <span key={personalId} className="tag tag-neutral" style={{ marginRight: 4, marginBottom: 4, display: "inline-flex", gap: 4 }}>
                          {p?.nombreCompleto ?? personalId}
                          <button
                            onClick={() => quitarMiembro(g.id, personalId)}
                            style={{ border: "none", background: "none", cursor: "pointer", color: "var(--danger)", fontWeight: 700, padding: 0 }}
                            title="Quitar del grupo"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                    {(g.miembrosHoy ?? []).length === 0 && <span>Sin miembros hoy.</span>}
                  </div>
                </div>
                <button className="btn-secondary" onClick={() => borrarGrupo(g.id)}>
                  Borrar grupo
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 10 }}>
                <select value={agregarA[g.id] ?? ""} onChange={(e) => setAgregarA((prev) => ({ ...prev, [g.id]: e.target.value }))}>
                  <option value="">Agregar persona…</option>
                  {personal
                    .filter((p) => !(g.miembrosHoy ?? []).includes(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombreCompleto}
                      </option>
                    ))}
                </select>
                <button className="btn-secondary" onClick={() => agregarMiembro(g.id)}>
                  Agregar
                </button>
              </div>
            </div>
          ))}
          {grupos.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Esta Huerta no tiene grupos de pago todavía.</p>}
        </div>
      </div>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px" }}>{error}</div>}
      {mensaje && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px" }}>{mensaje}</div>}
    </div>
  );
}
