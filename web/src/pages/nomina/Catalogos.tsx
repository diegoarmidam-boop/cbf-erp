import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { Actividad, ConfigNomina, EsquemaPago } from "../../lib/types";

const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const UNIDADES = ["hora", "dia", "surco", "planta", "remolque", "caja", "cuadro", "kg", "ha"];
const ESQUEMAS: { value: EsquemaPago; label: string }[] = [
  { value: "individual_hora", label: "Individual por hora" },
  { value: "individual_caja", label: "Individual por caja" },
  { value: "grupal_remolque", label: "Grupal por remolque" },
  { value: "depende_empacadores", label: "Depende de Empacadores" },
];

export default function Catalogos() {
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

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px" }}>{error}</div>}
      {mensaje && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px" }}>{mensaje}</div>}
    </div>
  );
}
