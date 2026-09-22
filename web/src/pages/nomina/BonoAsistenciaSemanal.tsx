import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { usePersonal } from "../../lib/usePersonal";
import type { AjusteAsistencia, ConfigBonoAsistencia, ResumenBonoAsistencia } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";
import { formatearDinero } from "../../lib/numero";

type Seccion = "semana" | "ajustes" | "config";

const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const etiquetaDia = (f: string) => DIA_CORTO[new Date(f + "T12:00:00").getDay()]!;

const MOTIVO_DIA: Record<string, string> = {
  ajuste: "Ajuste de Asistencia",
  destajo: "Destajo (día completo)",
  horas: "Horas suficientes",
  falta: "Sin registro (falta)",
  horas_insuficientes: "Horas insuficientes",
};

/**
 * Bono de Asistencia Semanal (V1 P7, 21-sep-2026). Nómina → Bonos → Bono
 * de Asistencia Semanal: la semana evaluada es siempre la de asistencia
 * anterior (Lun a Sáb) a la semana de Nómina en curso, calculada sola; el
 * bono se recalcula en vivo cada vez que cambia una captura o un Ajuste.
 */
export default function BonoAsistenciaSemanal() {
  const [seccion, setSeccion] = useState<Seccion>("semana");
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button className={seccion === "semana" ? "btn-primary" : "btn-secondary"} onClick={() => setSeccion("semana")}>
          Semana
        </button>
        <button className={seccion === "ajustes" ? "btn-primary" : "btn-secondary"} onClick={() => setSeccion("ajustes")}>
          Ajustes de Asistencia
        </button>
        <button className={seccion === "config" ? "btn-primary" : "btn-secondary"} onClick={() => setSeccion("config")}>
          Configuración
        </button>
      </div>
      {seccion === "semana" && <SemanaBono />}
      {seccion === "ajustes" && <Ajustes />}
      {seccion === "config" && <Configuracion />}
    </div>
  );
}

function SemanaBono() {
  const [resumen, setResumen] = useState<ResumenBonoAsistencia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soloGanan, setSoloGanan] = useState(false);

  useEffect(() => {
    api
      .get<ResumenBonoAsistencia>("/nomina/bono-asistencia/resumen")
      .then(setResumen)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }, []);

  if (error) return <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px" }}>{error}</div>;
  if (!resumen) return <p>Cargando…</p>;

  const filas = resumen.filas.filter((f) => !soloGanan || f.resultado.monto > 0);
  const total = resumen.filas.reduce((s, f) => s + f.resultado.monto, 0);

  return (
    <div>
      <div className="card" style={{ marginBottom: 12, fontSize: 12.5 }}>
        Semana de asistencia:{" "}
        <strong>
          Lunes {formatearFecha(resumen.semanaBono.inicio)} a Sábado {formatearFecha(resumen.semanaBono.fin)}
        </strong>{" "}
        — se paga con la Nómina del {formatearFecha(resumen.periodoNomina.inicio)} al {formatearFecha(resumen.periodoNomina.fin)}.{" "}
        {resumen.congelada ? (
          <span className="tag tag-neutral">Semana cerrada — congelado</span>
        ) : (
          <span className="tag tag-warning">En vivo — se recalcula solo</span>
        )}
        <div style={{ marginTop: 6 }}>
          Ganan el bono: <strong>{resumen.filas.filter((f) => f.resultado.monto > 0).length}</strong> · Total: <strong>{formatearDinero(total)}</strong>
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, marginBottom: 10 }}>
        <input type="checkbox" checked={soloGanan} onChange={(e) => setSoloGanan(e.target.checked)} /> Solo quienes ganan el bono
      </label>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Persona</th>
              {resumen.semanaBono.dias.map((d) => (
                <th key={d} title={formatearFecha(d)}>
                  {etiquetaDia(d)} {d.slice(8)}
                </th>
              ))}
              <th>Bono</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.personalId}>
                <td>{f.nombreCompleto}</td>
                {f.resultado.dias.map((d) => (
                  <td
                    key={d.fecha}
                    title={`${MOTIVO_DIA[d.motivo]}${d.motivo === "horas" || d.motivo === "horas_insuficientes" ? ` — ${d.horas.toFixed(2)} h de mínimo ${d.minimoHoras}` : ""}`}
                    style={{ color: d.cumple ? "var(--success, #16a34a)" : "var(--danger)", fontWeight: 700, textAlign: "center" }}
                  >
                    {d.cumple ? "✓" : "✗"}
                  </td>
                ))}
                <td>
                  {f.resultado.monto > 0 ? (
                    <strong>{formatearDinero(f.resultado.monto)}</strong>
                  ) : (
                    <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{f.resultado.motivoSinBono === "nunca" ? "Nunca recibe bono" : "Sin bono"}</span>
                  )}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: "var(--ink-soft)" }}>
                  Nadie con actividad esa semana.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Ajustes() {
  const { personal } = usePersonal();
  const [semana, setSemana] = useState<{ inicio: string; fin: string } | null>(null);
  const [ajustes, setAjustes] = useState<AjusteAsistencia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [personalId, setPersonalId] = useState("");
  const [fecha, setFecha] = useState("");
  const [diaCompleto, setDiaCompleto] = useState("no");
  const [justificado, setJustificado] = useState("si");
  const [nota, setNota] = useState("");

  function cargar() {
    api
      .get<ResumenBonoAsistencia>("/nomina/bono-asistencia/resumen")
      .then((r) => {
        setSemana(r.semanaBono);
        setFecha((f) => f || r.semanaBono.inicio);
      })
      .catch(() => {});
    api.get<AjusteAsistencia[]>("/nomina/bono-asistencia/ajustes").then(setAjustes).catch(() => setAjustes([]));
  }
  useEffect(cargar, []);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/nomina/bono-asistencia/ajustes", {
        personalId,
        fecha,
        diaCompleto: diaCompleto === "si",
        justificado: justificado === "si",
        nota: nota.trim() || undefined,
      });
      setNota("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el ajuste.");
    }
  }

  async function borrar(id: string) {
    setError(null);
    try {
      await api.delete(`/nomina/bono-asistencia/ajustes/${id}`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar.");
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>
        Tienen la última palabra sobre lo que el sistema calculó solo: si existe una fila para esa persona en esa fecha exacta, reemplaza el cálculo de ese día.
        Sirven para permisos, salidas justificadas y errores de captura conocidos. Captúralos antes de cerrar la semana. Capturar de nuevo la misma persona y
        fecha reemplaza la fila.
      </p>
      {semana && (
        <p style={{ fontSize: 12.5, marginBottom: 10 }}>
          Semana en curso del bono: Lunes {formatearFecha(semana.inicio)} a Sábado {formatearFecha(semana.fin)}.
        </p>
      )}
      <form onSubmit={guardar} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <label className="field">
          Persona
          <select value={personalId} onChange={(e) => setPersonalId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombreCompleto}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Fecha
          <FechaInput value={fecha} onChange={setFecha} required />
        </label>
        <label className="field">
          Día completo
          <select value={diaCompleto} onChange={(e) => setDiaCompleto(e.target.value)}>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="field">
          Justificado
          <select value={justificado} onChange={(e) => setJustificado(e.target.value)}>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="field">
          Nota
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. permiso médico" style={{ minWidth: 200 }} />
        </label>
        <button className="btn-primary" type="submit">
          Guardar ajuste
        </button>
      </form>
      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Persona</th>
            <th>Día completo</th>
            <th>Justificado</th>
            <th>Nota</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ajustes.map((a) => (
            <tr key={a.id}>
              <td>{formatearFecha(a.fecha)}</td>
              <td>{a.personal.nombreCompleto}</td>
              <td>{a.diaCompleto ? "Sí" : "No"}</td>
              <td>{a.justificado ? "Sí" : "No"}</td>
              <td>{a.nota ?? "—"}</td>
              <td>
                <button className="btn-secondary" onClick={() => borrar(a.id)}>
                  Quitar
                </button>
              </td>
            </tr>
          ))}
          {ajustes.length === 0 && (
            <tr>
              <td colSpan={6} style={{ color: "var(--ink-soft)" }}>
                Sin ajustes esta semana.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Configuracion() {
  const [config, setConfig] = useState<ConfigBonoAsistencia | null>(null);
  const [montoDefault, setMontoDefault] = useState("");
  const [montoEspecial, setMontoEspecial] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  function cargar() {
    api
      .get<ConfigBonoAsistencia>("/nomina/bono-asistencia/config")
      .then((c) => {
        setConfig(c);
        setMontoDefault(String(c.montos.montoDefault));
        setMontoEspecial(String(c.montos.montoEspecial));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }
  useEffect(cargar, []);

  async function guardarMontos() {
    setError(null);
    setMensaje(null);
    try {
      await api.put("/nomina/bono-asistencia/config/montos", { montoDefault: Number(montoDefault), montoEspecial: Number(montoEspecial) });
      setMensaje("Montos guardados.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  async function cambiar(id: string, campo: "bonoAsistenciaNunca" | "bonoAsistenciaMedioTiempo" | "bonoAsistenciaMontoEspecial", valor: boolean) {
    setError(null);
    try {
      await api.put(`/nomina/bono-asistencia/config/personas/${id}`, { [campo]: valor });
      setConfig((c) => (c ? { ...c, personas: c.personas.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)) } : c));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  if (!config) return error ? <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px" }}>{error}</div> : <p>Cargando…</p>;
  const q = busqueda.trim().toLowerCase();
  const personas = config.personas.filter((p) => !q || p.nombreCompleto.toLowerCase().includes(q));

  return (
    <div>
      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <label className="field">
          Monto default (MXN)
          <input type="number" min={0} step="1" value={montoDefault} onChange={(e) => setMontoDefault(e.target.value)} />
        </label>
        <label className="field">
          Monto especial (MXN)
          <input type="number" min={0} step="1" value={montoEspecial} onChange={(e) => setMontoEspecial(e.target.value)} />
        </label>
        <button className="btn-primary" onClick={guardarMontos}>
          Guardar montos
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>
        Por persona: <strong>Nunca recibe bono</strong> se revisa primero, antes que cualquier otra cosa. <strong>Medio tiempo</strong> baja el mínimo de horas
        (5.33 h entre semana, 4 h sábado, en vez de 8 h / 5.33 h). <strong>Monto especial</strong> usa el monto especial en vez del default. Solo se listan las
        personas con al menos una asistencia en la semana que se está viendo.
      </p>
      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
      {mensaje && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{mensaje}</div>}
      <input placeholder="Buscar persona…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ marginBottom: 10, maxWidth: 260 }} />
      <table>
        <thead>
          <tr>
            <th>Persona</th>
            <th>Nunca recibe bono</th>
            <th>Medio tiempo</th>
            <th>Monto especial</th>
          </tr>
        </thead>
        <tbody>
          {personas.map((p) => (
            <tr key={p.id}>
              <td>{p.nombreCompleto}</td>
              <td>
                <input type="checkbox" checked={p.bonoAsistenciaNunca} onChange={(e) => cambiar(p.id, "bonoAsistenciaNunca", e.target.checked)} />
              </td>
              <td>
                <input type="checkbox" checked={p.bonoAsistenciaMedioTiempo} onChange={(e) => cambiar(p.id, "bonoAsistenciaMedioTiempo", e.target.checked)} />
              </td>
              <td>
                <input type="checkbox" checked={p.bonoAsistenciaMontoEspecial} onChange={(e) => cambiar(p.id, "bonoAsistenciaMontoEspecial", e.target.checked)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
