import { useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useEquipos } from "../../lib/useEquipos";
import type { TipoEquipo } from "../../lib/types";

export default function Catalogo() {
  const { equipos, cargando, refetch } = useEquipos();
  const { refetchEquipos } = useOutletContext<{ refetchEquipos: () => void }>();
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [tipo, setTipo] = useState<TipoEquipo>("tractor");
  const [folio, setFolio] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [anio, setAnio] = useState("");
  const [placas, setPlacas] = useState("");

  useEffect(() => {
    if (!mostrarForm) return;
    api.get<{ folio: string }>(`/equipos/sugerir-folio?tipo=${tipo}`).then((r) => setFolio(r.folio));
  }, [tipo, mostrarForm]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/equipos", {
        tipo,
        folio,
        marca: marca || undefined,
        modelo: modelo || undefined,
        anio: anio ? Number(anio) : undefined,
        placas: placas || undefined,
      });
      setMarca("");
      setModelo("");
      setAnio("");
      setPlacas("");
      setMostrarForm(false);
      refetch();
      refetchEquipos(); // también refresca el selector del layout (nombre/folio del equipo recién creado)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Agregar equipo"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
          <label className="field">
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEquipo)}>
              <option value="tractor">Tractor</option>
              <option value="camioneta">Camioneta</option>
              <option value="remolque">Remolque</option>
              <option value="implemento">Implemento</option>
            </select>
          </label>
          <label className="field">
            Folio
            <input value={folio} onChange={(e) => setFolio(e.target.value)} required />
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
              <th>Folio</th>
              <th>Tipo</th>
              <th>Marca/Modelo</th>
              <th>Año</th>
              <th>Placas</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
