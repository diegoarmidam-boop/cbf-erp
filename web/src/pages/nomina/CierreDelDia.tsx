import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useHuertas } from "../../lib/useHuertas";
import type { CapturaHuertaTodasUPs, DiaCerradoInfo, DiaPendiente, ResumenCierreHuerta } from "../../lib/types";
import { formatearDinero, formatearNumero } from "../../lib/numero";
import { formatearFecha } from "../../lib/fecha";

const ROLES_EDITAR_NOMINA = ["director_general", "recursos_humanos", "encargado_nominas", "gerente_administrativo"];

function tagEstadoPlazo(estado: ResumenCierreHuerta["estadoPlazo"]) {
  if (estado === "al_corriente") return <span className="tag tag-success">Al corriente</span>;
  if (estado === "vence_hoy") return <span className="tag tag-warning">Vence hoy</span>;
  return <span className="tag tag-danger">Vencido</span>;
}

interface TarjetaPendiente extends ResumenCierreHuerta {
  fecha: string;
}

/**
 * Cierre de día (Bloque, 3-sep-2026): sin fechador — antes había que
 * cambiar de fecha a mano una por una para encontrar qué días faltaban por
 * cerrar. Ahora se listan automáticamente TODAS las tarjetas (Huerta+fecha)
 * con algo capturado y sin cerrar, sin importar la fecha — útil sobre todo
 * cuando se captura nómina atrasada (ej. una carga de base de datos) y hay
 * varios días pendientes de cerrar a la vez. Reutiliza `diasPendientesDeCierre`
 * (ya existía para las notificaciones) + `resumenCierreTodasUPs` por cada
 * fecha pendiente encontrada — sin endpoint nuevo.
 */
export default function CierreDelDia() {
  const { usuario } = useAuth();
  const { huertas } = useHuertas();
  const puedeVerCerrados = usuario ? ROLES_EDITAR_NOMINA.includes(usuario.rol) : false;

  const [tarjetas, setTarjetas] = useState<TarjetaPendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pre-llenado de contexto desde una notificación (29-ago-2026, "cierre
  // de día pendiente"): ?fecha=&huertaId= saltan directo al detalle de esa
  // Huerta/fecha, sin importar si sigue apareciendo en la lista de tarjetas.
  const [searchParams] = useSearchParams();
  const [huertaDetalle, setHuertaDetalle] = useState<{ id: string; nombre: string } | null>(null);
  const [fechaDetalle, setFechaDetalle] = useState<string | null>(null);
  const autoAbrioDetalle = useRef(false);

  const [mostrarCerrados, setMostrarCerrados] = useState(false);

  async function cargarPendientes() {
    if (huertas.length === 0) return;
    setCargando(true);
    setError(null);
    try {
      const listas = await Promise.allSettled(huertas.map((h) => api.get<DiaPendiente[]>(`/nomina/cierre/pendientes?huertaId=${h.id}`)));
      const fechas = new Set<string>();
      listas.forEach((r) => {
        if (r.status === "fulfilled") r.value.forEach((d) => fechas.add(d.fecha));
      });
      const fechasOrdenadas = [...fechas].sort();
      const resumenesPorFecha = await Promise.all(
        fechasOrdenadas.map((f) => api.get<ResumenCierreHuerta[]>(`/nomina/cierre/resumen/${f}`).then((filas) => filas.map((fila) => ({ ...fila, fecha: f }))))
      );
      setTarjetas(resumenesPorFecha.flat().filter((t) => !t.cerrado));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarPendientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huertas.length]);

  useEffect(() => {
    if (autoAbrioDetalle.current || huertas.length === 0) return;
    const fechaParam = searchParams.get("fecha");
    const huertaIdParam = searchParams.get("huertaId");
    if (!fechaParam || !huertaIdParam) return;
    const huerta = huertas.find((h) => h.id === huertaIdParam);
    if (huerta) {
      setHuertaDetalle({ id: huerta.id, nombre: huerta.nombre });
      setFechaDetalle(fechaParam);
    }
    autoAbrioDetalle.current = true;
  }, [huertas, searchParams]);

  if (huertaDetalle && fechaDetalle) {
    return (
      <DetalleCierre
        huerta={huertaDetalle}
        fecha={fechaDetalle}
        onVolver={() => {
          setHuertaDetalle(null);
          setFechaDetalle(null);
          cargarPendientes();
        }}
      />
    );
  }

  return (
    <div>
      {puedeVerCerrados && (
        <div style={{ marginBottom: 16 }}>
          <button className="btn-secondary" onClick={() => setMostrarCerrados((v) => !v)}>
            {mostrarCerrados ? "Ocultar días cerrados" : "Ver días cerrados"}
          </button>
        </div>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {mostrarCerrados && puedeVerCerrados && <DiasCerradosLista huertas={huertas} />}

      {cargando ? (
        <p>Cargando…</p>
      ) : tarjetas.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>No hay días pendientes de cerrar.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tarjetas.map((t) => (
            <div key={`${t.huerta.id}-${t.fecha}`} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>
                  {formatearFecha(t.fecha)} — {t.huerta.nombre} {tagEstadoPlazo(t.estadoPlazo)}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {formatearNumero(t.cantidadPersonas)} personas · {formatearNumero(t.totalActividades)} actividades · Total bruto {formatearDinero(t.totalBruto)}
                </div>
              </div>
              <button
                className="btn-primary"
                onClick={() => {
                  setHuertaDetalle(t.huerta);
                  setFechaDetalle(t.fecha);
                }}
              >
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
          {[...porPersona.entries()].map(([key, p]) => {
            // Monto bruto acumulado (Prioridad 3.2, 3-sep-2026) — mismo
            // criterio simple que el "Total a Pagar" del Paso 1 (cantidad ×
            // tarifaAplicada, ya congelada al capturar), sin descuento de
            // préstamo (esa regla de visibilidad ya documentada no cambia).
            const montoBruto = p.lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.tarifaAplicada), 0);
            return (
            <div key={key} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{formatearDinero(montoBruto)}</div>
              </div>
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
            );
          })}
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
