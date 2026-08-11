import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import type { RiegoHistorialSemanal } from "../../lib/types";
import FechaInput from "../../components/FechaInput";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export default function HistorialSemanal() {
  const { huertas } = useHuertas();
  const [fechaRef, setFechaRef] = useState(hoyISO());
  const [datos, setDatos] = useState<Record<string, RiegoHistorialSemanal>>({});

  useEffect(() => {
    huertas.forEach((h) => {
      api.get<RiegoHistorialSemanal>(`/riego/historial-semanal/${h.id}/${fechaRef}`).then((r) => {
        setDatos((prev) => ({ ...prev, [h.id]: r }));
      });
    });
  }, [huertas, fechaRef]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 18 }}>
        <label className="field" style={{ maxWidth: 200 }}>
          Semana que incluye
          <FechaInput value={fechaRef} onChange={setFechaRef} />
        </label>
        <button className="btn-secondary" onClick={() => setFechaRef((f) => sumarDias(f, -7))}>
          ← Semana anterior
        </button>
        <button className="btn-secondary" onClick={() => setFechaRef((f) => sumarDias(f, 7))}>
          Semana siguiente →
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {huertas.map((h) => {
          const semana = datos[h.id];
          return (
            <div key={h.id} className="card">
              <h3 style={{ marginBottom: 10 }}>{h.nombre}</h3>
              {!semana ? (
                <p style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>Cargando…</p>
              ) : semana.secciones.length === 0 ? (
                <p style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>Sin Secciones de Riego dadas de alta.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Sección</th>
                      {semana.dias.map((d) => (
                        <th key={d.fecha}>{d.etiqueta}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {semana.secciones.map(({ seccion, dias }) => (
                      <tr key={seccion.id}>
                        <td>{seccion.nombre}</td>
                        {dias.map((d) => (
                          <td key={d.fecha}>
                            {d.horas != null ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                {d.horas}h
                                {d.fertirriegoAplicado && (
                                  <span
                                    title="Fertirriego aplicado"
                                    style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success, #2e7d32)", display: "inline-block" }}
                                  />
                                )}
                              </span>
                            ) : (
                              <span style={{ color: "var(--ink-soft)" }}>—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
        {huertas.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay Huertas activas.</p>}
      </div>
    </div>
  );
}
