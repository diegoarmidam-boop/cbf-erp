import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useCuadros } from "../../lib/useCuadros";
import type { Ciclo, TipoCiclo, EtapaCiclo } from "../../lib/types";
import { useHuertaSeleccionada } from "./HuertaSeleccionadaContext";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const ETAPAS: { value: EtapaCiclo; label: string }[] = [
  { value: "preparacion_suelo", label: "Preparación de Suelos" },
  { value: "desarrollo", label: "Plantación / Desarrollo / Pre-cosecha" },
  { value: "cosecha_empaque", label: "Cosecha y Empaque" },
  { value: "post_cosecha", label: "Post-cosecha y descanso" },
];

export default function Ciclos() {
  const { huertaId } = useHuertaSeleccionada();
  const { cuadros } = useCuadros(huertaId);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [tipo, setTipo] = useState<TipoCiclo>("cultivo");
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [variedades, setVariedades] = useState<{ cuadroId: string; variedad: string }[]>([{ cuadroId: "", variedad: "" }]);

  function cargar() {
    if (!huertaId) return;
    api
      .get<Ciclo[]>(`/ciclos?huertaId=${huertaId}`)
      .then(setCiclos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  useEffect(cargar, [huertaId]);

  const activo = ciclos.find((c) => c.activo);

  async function crearCiclo(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/ciclos", {
        huertaId,
        tipo,
        fechaInicio,
        variedades: variedades.filter((v) => v.cuadroId && v.variedad),
      });
      setVariedades([{ cuadroId: "", variedad: "" }]);
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el ciclo.");
    }
  }

  async function avanzarEtapa(cicloId: string, etapa: EtapaCiclo) {
    setError(null);
    try {
      await api.post(`/ciclos/${cicloId}/avanzar-etapa`, { etapa });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo avanzar la etapa.");
    }
  }

  async function cerrarCiclo(cicloId: string) {
    setError(null);
    try {
      await api.post(`/ciclos/${cicloId}/cerrar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cerrar el ciclo.");
    }
  }

  return (
    <div>
      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {activo ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span className="tag tag-success">Ciclo activo</span> <span className="tag tag-neutral">{activo.tipo}</span>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>Inicio: {activo.fechaInicio.slice(0, 10)}</div>
            </div>
            <button className="btn-danger" onClick={() => cerrarCiclo(activo.id)}>
              Cerrar ciclo
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>Etapa actual</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ETAPAS.map((e) => (
                <button
                  key={e.value}
                  className={activo.etapaActual === e.value ? "btn-primary" : "btn-secondary"}
                  onClick={() => avanzarEtapa(activo.id, e.value)}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {activo.variedades.length > 0 && (
            <table style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Cuadro</th>
                  <th>Variedad</th>
                </tr>
              </thead>
              <tbody>
                {activo.variedades.map((v) => (
                  <tr key={v.id}>
                    <td>{cuadros.find((c) => c.id === v.cuadroId)?.nombre ?? v.cuadroId}</td>
                    <td>{v.variedad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <p style={{ color: "var(--ink-soft)", marginBottom: 14 }}>Esta Huerta no tiene un Ciclo activo.</p>
      )}

      {!activo && (
        <div style={{ marginBottom: 14 }}>
          <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? "Cancelar" : "+ Nuevo Ciclo"}
          </button>
        </div>
      )}

      {mostrarForm && (
        <form onSubmit={crearCiclo} className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <label className="field">
              Tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCiclo)}>
                <option value="cultivo">Cultivo</option>
                <option value="descanso">Descanso</option>
                <option value="prueba">Prueba</option>
              </select>
            </label>
            <label className="field">
              Fecha de inicio
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required />
            </label>
          </div>

          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>
            Composición varietal por Cuadro (hasta 10 filas para cuadros de prueba)
          </div>
          {variedades.map((v, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select
                value={v.cuadroId}
                onChange={(e) => setVariedades((prev) => prev.map((x, idx) => (idx === i ? { ...x, cuadroId: e.target.value } : x)))}
              >
                <option value="">Cuadro…</option>
                {cuadros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <input
                placeholder="Variedad"
                value={v.variedad}
                onChange={(e) => setVariedades((prev) => prev.map((x, idx) => (idx === i ? { ...x, variedad: e.target.value } : x)))}
              />
              {variedades.length > 1 && (
                <button type="button" className="btn-secondary" onClick={() => setVariedades((prev) => prev.filter((_, idx) => idx !== i))}>
                  Quitar
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary"
            disabled={variedades.length >= 10}
            onClick={() => setVariedades((prev) => [...prev, { cuadroId: "", variedad: "" }])}
          >
            + Otra variedad
          </button>

          <div style={{ marginTop: 14 }}>
            <button className="btn-primary" type="submit">
              Crear ciclo
            </button>
          </div>
        </form>
      )}

      <h3 style={{ marginBottom: 10 }}>Historial de Ciclos</h3>
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Inicio</th>
            <th>Fin</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {ciclos.map((c) => (
            <tr key={c.id}>
              <td>{c.tipo}</td>
              <td>{c.fechaInicio.slice(0, 10)}</td>
              <td>{c.fechaFin?.slice(0, 10) ?? "—"}</td>
              <td>{c.activo ? "Activo" : "Cerrado"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
