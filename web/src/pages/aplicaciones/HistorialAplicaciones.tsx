import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import type { Aplicacion, AplicacionRealizada, ModalidadAplicacion } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";
import { formatearNumero } from "../../lib/numero";

const ETIQUETAS_MODALIDAD: Record<ModalidadAplicacion, string> = { mochila: "Mochila", turbina: "Turbina", aguilon: "Aguilón", drone: "Drone" };

interface Entrada {
  clave: string;
  fecha: string;
  aplicacion: Aplicacion;
  reporte: AplicacionRealizada | null; // null = aplicación cerrada sin reportes (vencida/cancelada)
}

function nombreProducto(a: Aplicacion) {
  return a.grupos
    .flatMap((g) => g.productos)
    .map((p) => p.producto.ingredienteActivo ?? p.producto.nombreComercial)
    .join(" + ");
}

/**
 * Historial de Aplicaciones/Fumigación (20-sep-2026): lo que ya se hizo,
 * un renglón por cada reporte de avance (fecha real, cuadros y hectáreas,
 * personas y horas, comentario), más las aplicaciones que se cerraron sin
 * aplicarse (vencidas/canceladas). Solo lectura — reutiliza el mismo
 * endpoint de la lista (incluirCerradas), sin backend nuevo.
 */
export default function HistorialAplicaciones() {
  const { huertas } = useHuertas();
  const [aplicaciones, setAplicaciones] = useState<Aplicacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [huertaId, setHuertaId] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    api
      .get<Aplicacion[]>("/aplicaciones?incluirCerradas=true")
      .then(setAplicaciones)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el historial."))
      .finally(() => setCargando(false));
  }, []);

  const entradas = useMemo(() => {
    const lista: Entrada[] = [];
    for (const a of aplicaciones) {
      for (const r of a.realizadas) lista.push({ clave: r.id, fecha: r.fechaReal, aplicacion: a, reporte: r });
      if ((a.estado === "vencida" || a.estado === "cancelada") && a.realizadas.length === 0) {
        lista.push({ clave: a.id, fecha: a.fechaCancelacion ?? a.fechaFin, aplicacion: a, reporte: null });
      }
    }
    const q = busqueda.trim().toLowerCase();
    return lista
      .filter((e) => !huertaId || e.aplicacion.huertaId === huertaId)
      .filter((e) => !desde || e.fecha.slice(0, 10) >= desde)
      .filter((e) => !hasta || e.fecha.slice(0, 10) <= hasta)
      .filter((e) => !q || nombreProducto(e.aplicacion).toLowerCase().includes(q))
      .sort((x, y) => y.fecha.localeCompare(x.fecha));
  }, [aplicaciones, huertaId, desde, hasta, busqueda]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "flex-end" }}>
        <label className="field">
          Huerta
          <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)}>
            <option value="">Todas</option>
            {huertas.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Desde
          <FechaInput value={desde} onChange={setDesde} />
        </label>
        <label className="field">
          Hasta
          <FechaInput value={hasta} onChange={setHasta} />
        </label>
        <label className="field">
          Producto / Ingrediente Activo
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…" />
        </label>
      </div>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entradas.map((e) => {
            const a = e.aplicacion;
            const r = e.reporte;
            return (
              <div key={e.clave} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {formatearFecha(e.fecha)} — {a.huerta.nombre}
                  </div>
                  {r ? (
                    <span className="tag tag-success">Reporte de avance</span>
                  ) : (
                    <span className="tag tag-danger">{a.estado === "cancelada" ? "Cancelada" : "Vencida/liberada — no se aplicó"}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{nombreProducto(a)}</div>
                {a.tipoAplicacion && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Tipo: {a.tipoAplicacion.nombre}</div>}
                {r ? (
                  <>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                      {formatearNumero(Number(r.hectareas))} ha —{" "}
                      {r.grupos
                        .flatMap((g) => g.cuadros)
                        .map((c) => `${c.cuadro.nombre}${c.variedad ? ` (${c.variedad})` : ""}: ${formatearNumero(Number(c.hectareasAtribuidas))} ha`)
                        .join(", ") || "—"}
                    </div>
                    {r.lineas.map((l) => (
                      <div key={l.id} style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                        {ETIQUETAS_MODALIDAD[l.modalidad]} · {formatearNumero(Number(l.horas))} h
                        {l.operador ? ` · Operador: ${l.operador.nombreCompleto}` : ""}
                        {l.personas.length > 0 ? ` · ${l.personas.map((p) => p.personal.nombreCompleto).join(", ")}` : ""}
                      </div>
                    ))}
                    {r.comentario && <div style={{ fontSize: 12, marginTop: 4 }}>“{r.comentario}”</div>}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                    Programada del {formatearFecha(a.fechaInicio)} al {formatearFecha(a.fechaFin)}
                  </div>
                )}
              </div>
            );
          })}
          {entradas.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin historial con esos filtros.</p>}
        </div>
      )}
    </div>
  );
}
