import { useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useCuadros } from "../../lib/useCuadros";
import type { AreaEfectiva } from "../../lib/types";
import { useHuertaSeleccionada } from "./HuertaSeleccionadaContext";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HuertasYCuadros() {
  const { huertaId } = useHuertaSeleccionada();
  const { refetchHuertas } = useOutletContext<{ refetchHuertas: () => void }>();
  const { cuadros, cargando, refetch } = useCuadros(huertaId);
  const [area, setArea] = useState<AreaEfectiva | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mostrarFormHuerta, setMostrarFormHuerta] = useState(false);
  const [nombreHuerta, setNombreHuerta] = useState("");
  const [hectareasHuerta, setHectareasHuerta] = useState("");

  const [mostrarFormCuadro, setMostrarFormCuadro] = useState(false);
  const [nombreCuadro, setNombreCuadro] = useState("");
  const [hectareasCuadro, setHectareasCuadro] = useState("");
  const [distSurcos, setDistSurcos] = useState("");
  const [distPlantas, setDistPlantas] = useState("");
  const [variedad, setVariedad] = useState("");
  const [tipoSuelo, setTipoSuelo] = useState("");

  useEffect(() => {
    if (!huertaId) return;
    api
      .get<AreaEfectiva>(`/huertas/${huertaId}/area-efectiva`)
      .then(setArea)
      .catch(() => setArea(null));
  }, [huertaId, cuadros]);

  async function crearHuerta(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/huertas", { nombre: nombreHuerta, hectareasTotales: Number(hectareasHuerta) });
      setNombreHuerta("");
      setHectareasHuerta("");
      setMostrarFormHuerta(false);
      refetchHuertas();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  async function crearCuadro(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/cuadros", {
        huertaId,
        nombre: nombreCuadro,
        vigenteDesde: hoyISO(),
        version: {
          hectareas: Number(hectareasCuadro),
          distSurcosM: distSurcos ? Number(distSurcos) : undefined,
          distPlantasM: distPlantas ? Number(distPlantas) : undefined,
          variedad: variedad || undefined,
          tipoSuelo: tipoSuelo || undefined,
        },
      });
      setNombreCuadro("");
      setHectareasCuadro("");
      setDistSurcos("");
      setDistPlantas("");
      setVariedad("");
      setTipoSuelo("");
      setMostrarFormCuadro(false);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button className="btn-secondary" onClick={() => setMostrarFormHuerta((v) => !v)}>
          {mostrarFormHuerta ? "Cancelar" : "+ Nueva Huerta"}
        </button>
      </div>

      {mostrarFormHuerta && (
        <form onSubmit={crearHuerta} className="card" style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 18 }}>
          <label className="field">
            Nombre de la Huerta
            <input value={nombreHuerta} onChange={(e) => setNombreHuerta(e.target.value)} required />
          </label>
          <label className="field">
            Hectáreas totales
            <input type="number" step="0.01" value={hectareasHuerta} onChange={(e) => setHectareasHuerta(e.target.value)} required />
          </label>
          <button className="btn-primary" type="submit">
            Guardar
          </button>
        </form>
      )}

      {huertaId && (
        <>
          {area && (
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div className="kpi-card">
                <div className="label">Área efectiva</div>
                <div className="value">{area.areaEfectiva.toFixed(2)} ha</div>
              </div>
              <div className="kpi-card">
                <div className="label">% de aprovechamiento</div>
                <div className="value">{area.porcentajeAprovechamiento.toFixed(1)}%</div>
              </div>
              <div className="kpi-card">
                <div className="label">Cuadros</div>
                <div className="value">{cuadros.length}</div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <button className="btn-primary" onClick={() => setMostrarFormCuadro((v) => !v)}>
              {mostrarFormCuadro ? "Cancelar" : "+ Agregar Cuadro"}
            </button>
          </div>

          {mostrarFormCuadro && (
            <form onSubmit={crearCuadro} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
              <label className="field">
                Nombre/número
                <input value={nombreCuadro} onChange={(e) => setNombreCuadro(e.target.value)} required />
              </label>
              <label className="field">
                Hectáreas
                <input type="number" step="0.0001" value={hectareasCuadro} onChange={(e) => setHectareasCuadro(e.target.value)} required />
              </label>
              <label className="field">
                Tipo de suelo
                <input value={tipoSuelo} onChange={(e) => setTipoSuelo(e.target.value)} />
              </label>
              <label className="field">
                Variedad
                <input value={variedad} onChange={(e) => setVariedad(e.target.value)} />
              </label>
              <label className="field">
                Dist. entre surcos (m)
                <input type="number" step="0.01" value={distSurcos} onChange={(e) => setDistSurcos(e.target.value)} />
              </label>
              <label className="field">
                Dist. entre plantas (m)
                <input type="number" step="0.01" value={distPlantas} onChange={(e) => setDistPlantas(e.target.value)} />
              </label>
              <button className="btn-primary" type="submit">
                Guardar
              </button>
            </form>
          )}

          {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

          {cargando ? (
            <p>Cargando…</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Estatus</th>
                  <th>Hectáreas</th>
                  <th>Variedad</th>
                  <th>Marco de plantación</th>
                  <th>Plantas totales</th>
                </tr>
              </thead>
              <tbody>
                {cuadros.map((c) => {
                  const vigente = c.versiones.find((v) => !v.vigenteHasta) ?? c.versiones[0];
                  return (
                    <tr key={c.id}>
                      <td>{c.nombre}</td>
                      <td>
                        <span className={`tag ${c.estatus === "activo" ? "tag-success" : "tag-neutral"}`}>{c.estatus}</span>
                      </td>
                      <td>{vigente?.hectareas ?? "—"}</td>
                      <td>{vigente?.variedad ?? "—"}</td>
                      <td>{vigente?.distSurcosM && vigente?.distPlantasM ? `${vigente.distSurcosM} × ${vigente.distPlantasM} m` : "—"}</td>
                      <td>{c.plantasTotales != null ? Math.round(c.plantasTotales).toLocaleString("es-MX") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
