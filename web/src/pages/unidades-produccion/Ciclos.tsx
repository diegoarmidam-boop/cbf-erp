import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useCuadros } from "../../lib/useCuadros";
import type { Ciclo, TipoCiclo, EtapaCiclo } from "../../lib/types";
import { useHuertaSeleccionada } from "./HuertaSeleccionadaContext";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const ETAPAS: { value: EtapaCiclo; label: string }[] = [
  { value: "preparacion_suelo", label: "Preparación de Suelos" },
  { value: "desarrollo", label: "Plantación / Desarrollo / Pre-cosecha" },
  { value: "cosecha_empaque", label: "Cosecha y Empaque" },
  { value: "post_cosecha", label: "Post-cosecha y descanso" },
];

interface FilaVariedad {
  cuadroId: string;
  variedad: string;
  hectareas: string;
}

interface DesajusteCuadro {
  cuadroId: string;
  nombre: string;
  hectareasCuadro: number;
  hectareasAsignadas: number;
}

export default function Ciclos() {
  const { huertaId } = useHuertaSeleccionada();
  const { cuadros } = useCuadros(huertaId);
  const navigate = useNavigate();
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [tipo, setTipo] = useState<TipoCiclo>("cultivo");
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [variedades, setVariedades] = useState<FilaVariedad[]>([{ cuadroId: "", variedad: "", hectareas: "" }]);
  const [avisoSobrante, setAvisoSobrante] = useState<DesajusteCuadro[] | null>(null);

  function hectareasVigentesCuadro(cuadroId: string): number | null {
    const cuadro = cuadros.find((c) => c.id === cuadroId);
    if (!cuadro) return null;
    const vigente = cuadro.versiones.find((v) => !v.vigenteHasta) ?? cuadro.versiones[0];
    return vigente ? Number(vigente.hectareas) : null;
  }

  /** Suma hectáreas asignadas por Cuadro entre las filas de variedad con datos completos. */
  function desajustesPorCuadro(): { excedidos: DesajusteCuadro[]; sobrantes: DesajusteCuadro[] } {
    const filasValidas = variedades.filter((v) => v.cuadroId && v.variedad && v.hectareas);
    const sumaPorCuadro = new Map<string, number>();
    for (const v of filasValidas) {
      sumaPorCuadro.set(v.cuadroId, (sumaPorCuadro.get(v.cuadroId) ?? 0) + Number(v.hectareas));
    }
    const excedidos: DesajusteCuadro[] = [];
    const sobrantes: DesajusteCuadro[] = [];
    for (const [cuadroId, hectareasAsignadas] of sumaPorCuadro) {
      const hectareasCuadro = hectareasVigentesCuadro(cuadroId);
      if (hectareasCuadro == null) continue;
      const nombre = cuadros.find((c) => c.id === cuadroId)?.nombre ?? cuadroId;
      if (hectareasAsignadas > hectareasCuadro + 0.0001) {
        excedidos.push({ cuadroId, nombre, hectareasCuadro, hectareasAsignadas });
      } else if (hectareasAsignadas < hectareasCuadro - 0.0001) {
        sobrantes.push({ cuadroId, nombre, hectareasCuadro, hectareasAsignadas });
      }
    }
    return { excedidos, sobrantes };
  }

  function cargar() {
    if (!huertaId) return;
    api
      .get<Ciclo[]>(`/ciclos?huertaId=${huertaId}`)
      .then(setCiclos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  useEffect(cargar, [huertaId]);

  const activo = ciclos.find((c) => c.activo);

  async function enviarCiclo() {
    setError(null);
    try {
      await api.post("/ciclos", {
        huertaId,
        tipo,
        fechaInicio,
        variedades: variedades
          .filter((v) => v.cuadroId && v.variedad && v.hectareas)
          .map((v) => ({ cuadroId: v.cuadroId, variedad: v.variedad, hectareas: Number(v.hectareas) })),
      });
      setVariedades([{ cuadroId: "", variedad: "", hectareas: "" }]);
      setAvisoSobrante(null);
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el ciclo.");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAvisoSobrante(null);
    const { excedidos, sobrantes } = desajustesPorCuadro();
    if (excedidos.length > 0) {
      setError(
        excedidos
          .map(
            (d) =>
              `El Cuadro "${d.nombre}" tiene ${d.hectareasCuadro} ha, pero se están asignando ${d.hectareasAsignadas} ha entre sus variedades — corrige antes de continuar.`
          )
          .join(" ")
      );
      return;
    }
    if (sobrantes.length > 0) {
      setAvisoSobrante(sobrantes);
      return;
    }
    enviarCiclo();
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
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>Inicio: {formatearFecha(activo.fechaInicio)}</div>
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
                  <th>Hectáreas</th>
                </tr>
              </thead>
              <tbody>
                {activo.variedades.map((v) => (
                  <tr key={v.id}>
                    <td>{cuadros.find((c) => c.id === v.cuadroId)?.nombre ?? v.cuadroId}</td>
                    <td>{v.variedad}</td>
                    <td>{v.hectareas ?? "—"}</td>
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
        <form onSubmit={onSubmit} className="card" style={{ marginBottom: 20 }}>
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
              <FechaInput value={fechaInicio} onChange={setFechaInicio} required />
            </label>
          </div>

          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>
            Composición varietal por Cuadro — la suma de hectáreas por Cuadro no puede exceder su superficie
          </div>
          {variedades.map((v, i) => {
            const hectareasCuadro = v.cuadroId ? hectareasVigentesCuadro(v.cuadroId) : null;
            return (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
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
                <input
                  type="number"
                  min={0}
                  step="0.0001"
                  placeholder="Hectáreas"
                  style={{ width: 110 }}
                  value={v.hectareas}
                  onChange={(e) => setVariedades((prev) => prev.map((x, idx) => (idx === i ? { ...x, hectareas: e.target.value } : x)))}
                />
                {hectareasCuadro != null && (
                  <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>de {hectareasCuadro} ha</span>
                )}
                {variedades.length > 1 && (
                  <button type="button" className="btn-secondary" onClick={() => setVariedades((prev) => prev.filter((_, idx) => idx !== i))}>
                    Quitar
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setVariedades((prev) => [...prev, { cuadroId: "", variedad: "", hectareas: "" }])}
          >
            + Otra variedad
          </button>

          {avisoSobrante && (
            <div className="card" style={{ marginTop: 14, background: "var(--surface-warning, #fff8e6)", border: "1px solid var(--warning, #e0b400)" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Hay superficie sin asignar</div>
              {avisoSobrante.map((d) => (
                <div key={d.cuadroId} style={{ fontSize: 12.5, marginBottom: 4 }}>
                  El Cuadro "{d.nombre}" tiene {d.hectareasCuadro} ha, pero solo se asignaron {d.hectareasAsignadas} ha entre sus
                  variedades (faltan {(d.hectareasCuadro - d.hectareasAsignadas).toFixed(4)} ha por asignar).
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" className="btn-secondary" onClick={() => setAvisoSobrante(null)}>
                  Ajustar superficie por variedad
                </button>
                <button type="button" className="btn-secondary" onClick={() => navigate("/unidades_produccion/huertas")}>
                  Modificar Hectáreas Cuadro
                </button>
              </div>
            </div>
          )}

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
              <td>{formatearFecha(c.fechaInicio)}</td>
              <td>{formatearFecha(c.fechaFin)}</td>
              <td>{c.activo ? "Activo" : "Cerrado"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
