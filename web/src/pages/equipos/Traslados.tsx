import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useEquipos } from "../../lib/useEquipos";
import { useHuertas } from "../../lib/useHuertas";
import { useEquipoSeleccionado } from "./EquipoSeleccionadoContext";
import { subirEvidencia } from "../../lib/subirEvidencia";
import type { EquipoTraslado } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Traslados() {
  const { equipoId } = useEquipoSeleccionado();
  const { equipos } = useEquipos();
  const { huertas } = useHuertas();
  const equipoActual = equipos.find((e) => e.id === equipoId);

  const [traslados, setTraslados] = useState<EquipoTraslado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const [fecha, setFecha] = useState(hoyISO());
  const [huertaDestinoId, setHuertaDestinoId] = useState("");
  const [litros, setLitros] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);

  function cargar() {
    if (!equipoId) return;
    api.get<EquipoTraslado[]>(`/equipos/${equipoId}/traslados`).then(setTraslados);
  }
  useEffect(cargar, [equipoId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!archivo) {
      setError("Falta la foto del relleno al llegar.");
      return;
    }
    setSubiendo(true);
    try {
      const fotoUrl = await subirEvidencia(archivo);
      await api.post(`/equipos/${equipoId}/traslados`, { fecha, huertaDestinoId, litros: Number(litros), fotoUrl });
      setHuertaDestinoId("");
      setLitros("");
      setArchivo(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el Traslado.");
    } finally {
      setSubiendo(false);
    }
  }

  if (!equipoId) return <p style={{ color: "var(--ink-soft)" }}>No hay equipos dados de alta todavía.</p>;
  if (equipoActual && equipoActual.tipo !== "tractor") {
    return <p style={{ color: "var(--ink-soft)" }}>El Traslado entre ranchos solo aplica a Tractores.</p>;
  }

  const ranchoActual = huertas.find((h) => h.id === equipoActual?.ranchoActualId);

  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 14 }}>
        Rancho actual: <strong>{ranchoActual?.nombre ?? "Sin asignar"}</strong>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 10 }}>
        El combustible de este relleno es gasto indirecto de la empresa — no se carga a ninguna Huerta.
      </div>

      <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
        <label className="field">
          Fecha
          <FechaInput value={fecha} onChange={setFecha} required />
        </label>
        <label className="field">
          Rancho destino
          <select value={huertaDestinoId} onChange={(e) => setHuertaDestinoId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {huertas.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Litros del relleno al llegar
          <input type="number" step="0.01" value={litros} onChange={(e) => setLitros(e.target.value)} required />
        </label>
        <label className="field">
          Foto del relleno
          <input type="file" accept="image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} required />
        </label>
        <button className="btn-primary" type="submit" disabled={subiendo}>
          {subiendo ? "Guardando…" : "Registrar Traslado"}
        </button>
      </form>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Origen</th>
            <th>Destino</th>
            <th>Litros</th>
            <th>Foto</th>
          </tr>
        </thead>
        <tbody>
          {traslados.map((t) => (
            <tr key={t.id}>
              <td>{formatearFecha(t.fecha)}</td>
              <td>{t.huertaOrigen?.nombre ?? "—"}</td>
              <td>{t.huertaDestino.nombre}</td>
              <td>{t.litros}</td>
              <td>
                <a href={t.fotoUrl} target="_blank" rel="noreferrer">
                  Ver
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
