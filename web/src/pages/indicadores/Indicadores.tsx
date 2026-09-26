import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import { formatearNumero, formatearDinero } from "../../lib/numero";

type Modulo = "aplicaciones" | "granular" | "actividades";

interface IndicadorHuertaModulo {
  huertaId: string;
  huertaNombre: string;
  modulo: Modulo;
  numeroCierres: number;
  hectareasTotales: number;
  costoManoObraTotal: number;
  costoProductoTotal: number;
  costoTotal: number;
  costoPromedioPorHa: number | null;
  intervaloPromedioDias: number | null;
}

const NOMBRE_MODULO: Record<Modulo, string> = {
  aplicaciones: "Aplicaciones",
  granular: "Fertilización Granular",
  actividades: "Actividades",
};

const ORDEN_MODULO: Modulo[] = ["aplicaciones", "granular", "actividades"];

export default function Indicadores() {
  const { huertas } = useHuertas();
  const [huertaId, setHuertaId] = useState("");
  const [datos, setDatos] = useState<IndicadorHuertaModulo[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setCargando(true);
    const query = huertaId ? `?huertaId=${huertaId}` : "";
    api
      .get<IndicadorHuertaModulo[]>(`/indicadores${query}`)
      .then(setDatos)
      .finally(() => setCargando(false));
  }, [huertaId]);

  const huertaIds = huertaId ? [huertaId] : [...new Set(datos.map((d) => d.huertaId))];
  const huertaNombrePorId = new Map(datos.map((d) => [d.huertaId, d.huertaNombre]));

  return (
    <div>
      <h2 style={{ marginBottom: 6 }}>Indicadores</h2>
      <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 16 }}>
        Costo promedio por hectárea (mano de obra + producto) e intervalo entre pases, calculados por Huerta sobre programaciones ya cerradas (100% de avance,
        o canceladas) — sin un promedio global entre Huertas. Fertirriego todavía no está incluido aquí.
      </div>

      <label className="field" style={{ maxWidth: 280, marginBottom: 18 }}>
        Huerta
        <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)}>
          <option value="">Todas las Huertas</option>
          {huertas.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nombre}
            </option>
          ))}
        </select>
      </label>

      {cargando && <p style={{ color: "var(--ink-soft)" }}>Cargando…</p>}
      {!cargando && huertaIds.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Todavía no hay programaciones cerradas para calcular indicadores.</p>}

      {!cargando &&
        huertaIds.map((hid) => (
          <div key={hid} className="card" style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>{huertaNombrePorId.get(hid) ?? hid}</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {ORDEN_MODULO.map((modulo) => {
                const fila = datos.find((d) => d.huertaId === hid && d.modulo === modulo);
                return (
                  <div key={modulo} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 12, minWidth: 220, flex: "1 1 220px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{NOMBRE_MODULO[modulo]}</div>
                    {!fila || fila.numeroCierres === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Sin programaciones cerradas todavía.</div>
                    ) : (
                      <div style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
                        <div>
                          Costo promedio/ha: <strong>{fila.costoPromedioPorHa != null ? formatearDinero(fila.costoPromedioPorHa) : "—"}</strong>
                        </div>
                        <div style={{ color: "var(--ink-soft)" }}>
                          Mano de obra: {formatearDinero(fila.costoManoObraTotal)} · Producto: {formatearDinero(fila.costoProductoTotal)}
                        </div>
                        <div>
                          Intervalo entre pases: <strong>{fila.intervaloPromedioDias != null ? `${formatearNumero(fila.intervaloPromedioDias, 1)} días` : "—"}</strong>
                        </div>
                        <div style={{ color: "var(--ink-soft)" }}>
                          {fila.numeroCierres} cierre{fila.numeroCierres === 1 ? "" : "s"} · {formatearNumero(fila.hectareasTotales)} ha trabajadas
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
