import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { ConfigNomina } from "../../lib/types";

const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

// El catálogo de Actividades vivía aquí; se movió a su propio submódulo
// dentro de Actividades (9.4, 15-ago-2026) — ver
// web/src/pages/actividades/CatalogoActividades.tsx. Esta pantalla se
// queda solo con la configuración general de Nómina.
export default function Catalogos() {
  const [config, setConfig] = useState<ConfigNomina | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [tarifaGeneral, setTarifaGeneral] = useState("");
  const [diaCorte, setDiaCorte] = useState("jueves");
  const [diasGracia, setDiasGracia] = useState("3");

  function cargar() {
    api.get<ConfigNomina>("/nomina/config").then((c) => {
      setConfig(c);
      setTarifaGeneral(c.tarifaGeneralHora != null ? String(c.tarifaGeneralHora) : "");
      setDiaCorte(c.diaCorteSemanal);
      setDiasGracia(String(c.diasGraciaCierre));
    });
  }

  useEffect(cargar, []);

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
    <div style={{ maxWidth: 420 }}>
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

      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 14 }}>
        ¿Buscas el catálogo de Actividades? Ahora vive en <strong>Actividades → Catálogo</strong>.
      </div>
    </div>
  );
}
