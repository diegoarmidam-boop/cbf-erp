import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useCuadros } from "../../lib/useCuadros";
import type { SeccionRiego, SeccionRiegoLineasCintilla } from "../../lib/types";
import { useHuertaSeleccionada } from "./HuertaSeleccionadaContext";
import ConfirmModal from "../../components/ConfirmModal";
import { formatearFecha } from "../../lib/fecha";
import FechaInput from "../../components/FechaInput";

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SeccionesRiego() {
  const { huertaId } = useHuertaSeleccionada();
  const { cuadros } = useCuadros(huertaId);
  const [secciones, setSecciones] = useState<SeccionRiego[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [cuadroIds, setCuadroIds] = useState<string[]>([]);

  // Líneas de cintilla por surco (Prioridad 4, 14-sep-2026): vigente hoy,
  // por sección — solo informativo aquí; el histórico completo vive en la
  // base de datos, no hace falta mostrarlo en esta tabla.
  const [lineasVigentes, setLineasVigentes] = useState<Record<string, number | null>>({});
  const [lineasDesde, setLineasDesde] = useState<Record<string, string | null>>({});
  const [editandoLineasId, setEditandoLineasId] = useState<string | null>(null);
  const [lineasForm, setLineasForm] = useState("");
  const [vigenteDesdeForm, setVigenteDesdeForm] = useState(hoyISO());

  function cargar() {
    if (!huertaId) return;
    api
      .get<SeccionRiego[]>(`/secciones-riego?huertaId=${huertaId}`)
      .then((data) => {
        setSecciones(data);
        for (const s of data) cargarLineasVigentes(s.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  function cargarLineasVigentes(seccionId: string) {
    api
      .get<SeccionRiegoLineasCintilla[]>(`/secciones-riego/${seccionId}/lineas-cintilla`)
      .then((historial) => {
        // Bug real (V1 P4, 21-sep-2026): el backend manda estas fechas como
        // "2026-09-19T00:00:00.000Z" y aquí se comparaban como texto contra
        // "2026-09-19" -- el mismo día NO cumplía "<=" (el texto más largo es
        // mayor), así que un valor capturado con vigencia hoy (el default)
        // parecía no haberse guardado. Se comparan solo los 10 caracteres de fecha.
        const hoy = hoyISO();
        const dia = (f: string | null) => (f ? f.slice(0, 10) : null);
        const vigente = historial.find((h) => dia(h.vigenteDesde)! <= hoy && (h.vigenteHasta == null || dia(h.vigenteHasta)! >= hoy));
        // Sin vigente hoy pero con una captura a futuro: se muestra esa (con su fecha) en vez de "sin capturar".
        const proxima = vigente ? undefined : historial.find((h) => dia(h.vigenteDesde)! > hoy);
        setLineasVigentes((prev) => ({ ...prev, [seccionId]: vigente?.lineas ?? proxima?.lineas ?? null }));
        setLineasDesde((prev) => ({ ...prev, [seccionId]: proxima ? dia(proxima.vigenteDesde) : null }));
      })
      .catch(() => {});
  }

  useEffect(cargar, [huertaId]);

  async function guardarLineasCintilla(seccionId: string) {
    setError(null);
    try {
      await api.post(`/secciones-riego/${seccionId}/lineas-cintilla`, { lineas: Number(lineasForm), vigenteDesde: vigenteDesdeForm });
      setEditandoLineasId(null);
      setLineasForm("");
      cargarLineasVigentes(seccionId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  function toggleCuadro(id: string) {
    setCuadroIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function eliminar(id: string) {
    setError(null);
    try {
      await api.delete(`/secciones-riego/${id}`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar.");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/secciones-riego", { huertaId, nombre, cuadroIds });
      setNombre("");
      setCuadroIds([]);
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Nueva Sección de Riego"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ marginBottom: 18 }}>
          <label className="field" style={{ marginBottom: 12, maxWidth: 280 }}>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>Cuadros que comparten esta válvula</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {cuadros.map((c) => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5 }}>
                <input type="checkbox" checked={cuadroIds.includes(c.id)} onChange={() => toggleCuadro(c.id)} />
                {c.nombre}
              </label>
            ))}
          </div>
          <button className="btn-primary" type="submit">
            Guardar
          </button>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Cuadros</th>
            <th>Líneas de cintilla</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {secciones.map((s) => (
            <tr key={s.id}>
              <td>{s.nombre}</td>
              <td>{s.cuadros.map((c) => c.cuadro.nombre).join(", ") || "—"}</td>
              <td>
                {editandoLineasId === s.id ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <label className="field" style={{ maxWidth: 70 }}>
                      Líneas
                      <input type="number" min={1} step="1" value={lineasForm} onChange={(e) => setLineasForm(e.target.value)} />
                    </label>
                    <label className="field" style={{ maxWidth: 150 }}>
                      Vigente desde
                      <FechaInput value={vigenteDesdeForm} onChange={setVigenteDesdeForm} />
                    </label>
                    <button className="btn-primary" onClick={() => guardarLineasCintilla(s.id)} disabled={!lineasForm}>
                      Guardar
                    </button>
                    <button className="btn-secondary" onClick={() => setEditandoLineasId(null)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <span>
                    {lineasVigentes[s.id] ?? "— (sin capturar)"}
                    {lineasDesde[s.id] && <span style={{ fontSize: 11, color: "var(--ink-soft)" }}> (desde {formatearFecha(lineasDesde[s.id]!)})</span>}{" "}
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => {
                        setEditandoLineasId(s.id);
                        setLineasForm(lineasVigentes[s.id] != null ? String(lineasVigentes[s.id]) : "");
                        setVigenteDesdeForm(hoyISO());
                      }}
                    >
                      {lineasVigentes[s.id] != null ? "Cambiar" : "Capturar"}
                    </button>
                  </span>
                )}
              </td>
              <td>
                <button className="btn-secondary" onClick={() => setConfirmandoId(s.id)}>
                  Borrar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {confirmandoId && (
        <ConfirmModal
          titulo="Borrar Sección de Riego"
          mensaje="¿Borrar esta Sección de Riego? Esto no se puede deshacer."
          peligroso
          onCancelar={() => setConfirmandoId(null)}
          onConfirmar={async () => {
            await eliminar(confirmandoId);
            setConfirmandoId(null);
          }}
        />
      )}
    </div>
  );
}
