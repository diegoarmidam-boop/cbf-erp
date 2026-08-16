import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { Actividad, EsquemaPago, TipoRecursoActividad } from "../../lib/types";

const UNIDADES = ["hora", "dia", "surco", "planta", "remolque", "caja", "cuadro", "kg", "ha"];
const ESQUEMAS: { value: EsquemaPago; label: string }[] = [
  { value: "individual_hora", label: "Individual por hora" },
  { value: "individual_caja", label: "Individual por caja" },
  { value: "grupal_remolque", label: "Grupal por remolque" },
  { value: "depende_empacadores", label: "Depende de Empacadores" },
];
const TIPOS_RECURSO: { value: TipoRecursoActividad; label: string }[] = [
  { value: "gente", label: "Solo gente" },
  { value: "tractor", label: "Solo tractor" },
  { value: "mixta", label: "Mixta (tractor + gente)" },
];

// Catálogo de Actividades (9.4, 15-ago-2026): movido de Nómina > Catálogos
// a su propio submódulo dentro de Actividades — mismos datos, mismo botón
// "+", ahora con edición general y el campo de tipo de recurso.
export default function CatalogoActividades() {
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [unidad, setUnidad] = useState("hora");
  const [esquemaPago, setEsquemaPago] = useState<EsquemaPago>("individual_hora");
  const [usarTarifaGeneral, setUsarTarifaGeneral] = useState(true);
  const [tarifa, setTarifa] = useState("0");
  const [requiereCuadro, setRequiereCuadro] = useState(false);
  const [tipoRecurso, setTipoRecurso] = useState<TipoRecursoActividad>("gente");

  function cargar() {
    api.get<Actividad[]>("/actividades/definiciones?todas=true").then(setActividades);
  }

  useEffect(cargar, []);

  function limpiarForm() {
    setNombre("");
    setUnidad("hora");
    setEsquemaPago("individual_hora");
    setUsarTarifaGeneral(true);
    setTarifa("0");
    setRequiereCuadro(false);
    setTipoRecurso("gente");
    setEditandoId(null);
    setMostrarForm(false);
  }

  function iniciarEdicion(a: Actividad) {
    setEditandoId(a.id);
    setNombre(a.nombre);
    setUnidad(a.unidad);
    setEsquemaPago(a.esquemaPago);
    setUsarTarifaGeneral(a.usarTarifaGeneral);
    setTarifa(a.tarifa);
    setRequiereCuadro(a.requiereCuadro);
    setTipoRecurso(a.tipoRecurso);
    setError(null);
    setMostrarForm(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    const payload = { nombre, unidad, esquemaPago, usarTarifaGeneral, tarifa: Number(tarifa), requiereCuadro, tipoRecurso };
    try {
      if (editandoId) {
        const r = await api.patch<{ mensaje?: string }>(`/actividades/definiciones/${editandoId}`, payload);
        setMensaje(r.mensaje ?? "Actividad actualizada.");
      } else {
        const r = await api.post<{ mensaje?: string }>("/actividades/definiciones", payload);
        setMensaje(r.mensaje ?? "Actividad creada.");
      }
      limpiarForm();
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la actividad.");
    }
  }

  async function toggleActivo(a: Actividad) {
    setError(null);
    try {
      await api.patch(`/actividades/definiciones/${a.id}/activo`, { activo: !a.activo });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => (mostrarForm ? limpiarForm() : setMostrarForm(true))}>
          {mostrarForm ? "Cancelar" : "+ Nueva actividad"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
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
          <label className="field">
            Tipo de recurso
            <select value={tipoRecurso} onChange={(e) => setTipoRecurso(e.target.value as TipoRecursoActividad)}>
              {TIPOS_RECURSO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="submit">
            {editandoId ? "Guardar cambios" : "Guardar"}
          </button>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
      {mensaje && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{mensaje}</div>}

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Unidad</th>
            <th>Esquema</th>
            <th>Tarifa</th>
            <th>Recurso</th>
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
              <td>{TIPOS_RECURSO.find((t) => t.value === a.tipoRecurso)?.label ?? a.tipoRecurso}</td>
              <td>
                <span className={`tag ${a.activo ? "tag-success" : "tag-danger"}`}>{a.activo ? "Activa" : "Inactiva"}</span>
              </td>
              <td style={{ display: "flex", gap: 6 }}>
                <button className="btn-secondary" onClick={() => iniciarEdicion(a)}>
                  Editar
                </button>
                <button className="btn-secondary" onClick={() => toggleActivo(a)}>
                  {a.activo ? "Desactivar" : "Reactivar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
