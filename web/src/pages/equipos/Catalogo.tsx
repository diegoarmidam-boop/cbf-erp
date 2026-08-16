import { useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useEquipos } from "../../lib/useEquipos";
import { usePersonal } from "../../lib/usePersonal";
import type { Equipo, TipoEquipo } from "../../lib/types";

export default function Catalogo() {
  const { equipos, cargando, refetch } = useEquipos(undefined, true);
  const { personal } = usePersonal();
  const { refetchEquipos } = useOutletContext<{ refetchEquipos: () => void }>();
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoEquipo>("tractor");
  const [folio, setFolio] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [anio, setAnio] = useState("");
  const [placas, setPlacas] = useState("");
  const [operadorDesignadoId, setOperadorDesignadoId] = useState("");

  useEffect(() => {
    if (!mostrarForm || editandoId) return;
    api.get<{ folio: string }>(`/equipos/sugerir-folio?tipo=${tipo}`).then((r) => setFolio(r.folio));
  }, [tipo, mostrarForm, editandoId]);

  async function toggleActivo(eq: { id: string; activo: boolean }) {
    setError(null);
    try {
      await api.patch(`/equipos/${eq.id}/activo`, { activo: !eq.activo });
      refetch();
      refetchEquipos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar.");
    }
  }

  function limpiarForm() {
    setMarca("");
    setModelo("");
    setAnio("");
    setPlacas("");
    setOperadorDesignadoId("");
    setEditandoId(null);
    setMostrarForm(false);
  }

  function iniciarEdicion(eq: Equipo) {
    setEditandoId(eq.id);
    setTipo(eq.tipo);
    setFolio(eq.folio);
    setMarca(eq.marca ?? "");
    setModelo(eq.modelo ?? "");
    setAnio(eq.anio != null ? String(eq.anio) : "");
    setPlacas(eq.placas ?? "");
    setOperadorDesignadoId(eq.operadorDesignadoId ?? "");
    setError(null);
    setMostrarForm(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editandoId) {
        await api.patch(`/equipos/${editandoId}`, {
          marca: marca || undefined,
          modelo: modelo || undefined,
          anio: anio ? Number(anio) : undefined,
          placas: placas || undefined,
          operadorDesignadoId: operadorDesignadoId || null,
        });
      } else {
        await api.post("/equipos", {
          tipo,
          folio,
          marca: marca || undefined,
          modelo: modelo || undefined,
          anio: anio ? Number(anio) : undefined,
          placas: placas || undefined,
          operadorDesignadoId: operadorDesignadoId || undefined,
        });
      }
      limpiarForm();
      refetch();
      refetchEquipos(); // también refresca el selector del layout (nombre/folio del equipo recién creado)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button
          className="btn-primary"
          onClick={() => {
            if (mostrarForm) limpiarForm();
            else setMostrarForm(true);
          }}
        >
          {mostrarForm ? "Cancelar" : "+ Agregar equipo"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
          <label className="field">
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEquipo)} disabled={!!editandoId}>
              <option value="tractor">Tractor</option>
              <option value="camioneta">Camioneta</option>
              <option value="remolque">Remolque</option>
              <option value="implemento">Implemento</option>
            </select>
          </label>
          <label className="field">
            Folio
            <input value={folio} onChange={(e) => setFolio(e.target.value)} required disabled={!!editandoId} />
          </label>
          <label className="field">
            Marca
            <input value={marca} onChange={(e) => setMarca(e.target.value)} />
          </label>
          <label className="field">
            Modelo
            <input value={modelo} onChange={(e) => setModelo(e.target.value)} />
          </label>
          <label className="field">
            Año
            <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} />
          </label>
          {(tipo === "tractor" || tipo === "camioneta") && (
            <label className="field">
              Placas
              <input value={placas} onChange={(e) => setPlacas(e.target.value)} />
            </label>
          )}
          <label className="field">
            Operador designado
            <select value={operadorDesignadoId} onChange={(e) => setOperadorDesignadoId(e.target.value)}>
              <option value="">Sin operador fijo</option>
              {personal.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombreCompleto}
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

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Tipo</th>
              <th>Marca/Modelo</th>
              <th>Año</th>
              <th>Placas</th>
              <th>Operador designado</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {equipos.map((e) => (
              <tr key={e.id}>
                <td>{e.folio}</td>
                <td>{e.tipo}</td>
                <td>
                  {e.marca} {e.modelo}
                </td>
                <td>{e.anio ?? "—"}</td>
                <td>{e.placas ?? "—"}</td>
                <td>{personal.find((p) => p.id === e.operadorDesignadoId)?.nombreCompleto ?? "—"}</td>
                <td>
                  <span className={`tag ${e.activo ? "tag-success" : "tag-danger"}`}>{e.activo ? "Activo" : "Inactivo"}</span>
                </td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="btn-secondary" onClick={() => iniciarEdicion(e)}>
                    Editar
                  </button>
                  <button className="btn-secondary" onClick={() => toggleActivo(e)}>
                    {e.activo ? "Desactivar" : "Reactivar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
