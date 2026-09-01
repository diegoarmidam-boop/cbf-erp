import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useHuertas } from "../../lib/useHuertas";
import type { CapturaHuertaTodasUPs, DiaCerradoInfo, ResumenCierreHuerta } from "../../lib/types";
import { formatearDinero, formatearNumero } from "../../lib/numero";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";

const ROLES_EDITAR_NOMINA = ["director_general", "recursos_humanos", "encargado_nominas", "gerente_administrativo"];

function hoyISO(): string {
  const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tagEstadoPlazo(estado: ResumenCierreHuerta["estadoPlazo"]) {
  if (estado === "al_corriente") return <span className="tag tag-success">Al corriente</span>;
  if (estado === "vence_hoy") return <span className="tag tag-warning">Vence hoy</span>;
  return <span className="tag tag-danger">Vencido</span>;
}

export default function CierreDelDia() {
  const { usuario } = useAuth();
  const { huertas } = useHuertas();
  const puedeVerCerrados = usuario ? ROLES_EDITAR_NOMINA.includes(usuario.rol) : false;

  // Pre-llenado de contexto desde una notificación (29-ago-2026, "cierre
  // de día pendiente"): ?fecha= precarga el día; ?huertaId= (si matchea una
  // fila del resumen de ese día) salta directo al detalle de esa Huerta,
  // en vez de dejar al usuario buscarla a mano entre las tarjetas.
  const [searchParams] = useSearchParams();
  const [fecha, setFecha] = useState(searchParams.get("fecha") || hoyISO());
  const [resumen, setResumen] = useState<ResumenCierreHuerta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [huertaDetalle, setHuertaDetalle] = useState<{ id: string; nombre: string } | null>(null);
  const autoAbrioDetalle = useRef(false);

  const [mostrarCerrados, setMostrarCerrados] = useState(false);

  function cargarResumen() {
    if (!fecha) return;
    setCargando(true);
    setError(null);
    api
      .get<ResumenCierreHuerta[]>(`/nomina/cierre/resumen/${fecha}`)
      .then(setResumen)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargarResumen, [fecha]);

  useEffect(() => {
    if (autoAbrioDetalle.current || resumen.length === 0) return;
    const huertaIdBuscada = searchParams.get("huertaId");
    if (!huertaIdBuscada) return;
    const fila = resumen.find((r) => r.huerta.id === huertaIdBuscada);
    if (fila) setHuertaDetalle(fila.huerta);
    autoAbrioDetalle.current = true;
  }, [resumen, searchParams]);

  if (huertaDetalle) {
    return (
      <DetalleCierre
        huerta={huertaDetalle}
        fecha={fecha}
        onVolver={() => {
          setHuertaDetalle(null);
          cargarResumen();
        }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="field" style={{ maxWidth: 180 }}>
          Fecha
          <FechaInput value={fecha} onChange={setFecha} />
        </label>
        {puedeVerCerrados && (
          <button className="btn-secondary" onClick={() => setMostrarCerrados((v) => !v)}>
            {mostrarCerrados ? "Ocultar días cerrados" : "Ver días cerrados"}
          </button>
        )}
      </div>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {mostrarCerrados && puedeVerCerrados && <DiasCerradosLista huertas={huertas} />}

      {cargando ? (
        <p>Cargando…</p>
      ) : resumen.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>No hay nada capturado en ninguna Huerta para este día.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {resumen.map((r) => (
            <div key={r.huerta.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>
                  {r.huerta.nombre} {r.cerrado ? <span className="tag tag-neutral">Cerrado</span> : tagEstadoPlazo(r.estadoPlazo)}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {formatearNumero(r.cantidadPersonas)} personas · {formatearNumero(r.totalActividades)} actividades · Total bruto {formatearDinero(r.totalBruto)}
                </div>
              </div>
              <button className="btn-primary" onClick={() => setHuertaDetalle(r.huerta)}>
                Ver detalle
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetalleCierre({ huerta, fecha, onVolver }: { huerta: { id: string; nombre: string }; fecha: string; onVolver: () => void }) {
  const [datos, setDatos] = useState<Omit<CapturaHuertaTodasUPs, "huerta"> | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    api
      .get<Omit<CapturaHuertaTodasUPs, "huerta">>(`/nomina/captura/${huerta.id}/${fecha}`)
      .then(setDatos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [huerta.id, fecha]);

  async function cerrarDia() {
    if (!confirm(`¿Cerrar el día ${formatearFecha(fecha)} de ${huerta.nombre}? Ya no se podrán editar las capturas después.`)) return;
    setCerrando(true);
    setError(null);
    try {
      await api.post(`/nomina/cierre/${huerta.id}/${fecha}`);
      onVolver();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cerrar el día.");
    } finally {
      setCerrando(false);
    }
  }

  const porPersona = new Map<string, { nombre: string; lineas: typeof datos extends null ? never : NonNullable<typeof datos>["registros"] }>();
  if (datos) {
    for (const r of datos.registros) {
      const key = r.personalId ? `p:${r.personalId}` : `g:${r.grupoId}`;
      const nombre = r.personalId ? r.personal?.nombreCompleto ?? "—" : "Grupo";
      if (!porPersona.has(key)) porPersona.set(key, { nombre, lineas: [] });
      porPersona.get(key)!.lineas.push(r);
    }
  }

  return (
    <div>
      <button className="btn-secondary" onClick={onVolver} style={{ marginBottom: 14 }}>
        ← Volver al resumen
      </button>
      <h3 style={{ marginBottom: 4 }}>
        {huerta.nombre} — {formatearFecha(fecha)}
      </h3>
      {datos?.cerrado && <span className="tag tag-neutral">Este día ya está cerrado</span>}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", margin: "12px 0" }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {[...porPersona.entries()].map(([key, p]) => (
            <div key={key} className="card">
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{p.nombre}</div>
              <table>
                <thead>
                  <tr>
                    <th>Actividad</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {p.lineas.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.actividad.nombre}
                        {l.origen !== "manual" && <span className="tag tag-neutral" style={{ marginLeft: 6 }}>Automático</span>}
                      </td>
                      <td>
                        {l.cantidad} {l.actividad.unidad}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {porPersona.size === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin capturas ese día.</p>}
        </div>
      )}

      {!datos?.cerrado && (
        <div style={{ marginTop: 18 }}>
          <button className="btn-primary" onClick={cerrarDia} disabled={cerrando || cargando}>
            {cerrando ? "Cerrando…" : "Cerrar día"}
          </button>
        </div>
      )}
    </div>
  );
}

function DiasCerradosLista({ huertas }: { huertas: { id: string; nombre: string }[] }) {
  const [huertaId, setHuertaId] = useState("");
  const [dias, setDias] = useState<DiaCerradoInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!huertaId && huertas.length > 0) setHuertaId(huertas[0]!.id);
  }, [huertas, huertaId]);

  function cargar() {
    if (!huertaId) return;
    api.get<DiaCerradoInfo[]>(`/nomina/cierre/cerrados?huertaId=${huertaId}`).then(setDias);
  }

  useEffect(cargar, [huertaId]);

  async function reabrir(fecha: string) {
    if (!confirm(`¿Reabrir el día ${formatearFecha(fecha)}? Se podrá volver a editar la captura hasta que se cierre de nuevo.`)) return;
    setError(null);
    try {
      await api.delete(`/nomina/cierre/${huertaId}/${fecha}`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reabrir.");
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <label className="field" style={{ maxWidth: 240, marginBottom: 10 }}>
        Huerta
        <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)}>
          {huertas.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nombre}
            </option>
          ))}
        </select>
      </label>
      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 10 }}>{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Cerrado por</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.fecha}>
              <td>{formatearFecha(d.fecha)}</td>
              <td>{d.cerradoPorNombre}</td>
              <td style={{ display: "flex", gap: 6 }}>
                <Link to={`/nomina/captura?fecha=${d.fecha}`} className="btn-secondary">
                  Ir a corregir
                </Link>
                <button className="btn-secondary" onClick={() => reabrir(d.fecha)}>
                  Reabrir
                </button>
              </td>
            </tr>
          ))}
          {dias.length === 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                Sin días cerrados en esta Huerta.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
