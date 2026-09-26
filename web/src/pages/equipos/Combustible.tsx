import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useProductos } from "../../lib/useProductos";
import { useEquipos } from "../../lib/useEquipos";
import { useHuertas } from "../../lib/useHuertas";
import { useEquipoSeleccionado } from "./EquipoSeleccionadoContext";
import { subirEvidencia } from "../../lib/subirEvidencia";
import type { AlertaRendimiento, CombustibleCarga } from "../../lib/types";
import { formatearNumero } from "../../lib/numero";
import FechaInput from "../../components/FechaInput";
import { formatearFecha } from "../../lib/fecha";

function hoyISO(): string {
  const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Combustible() {
  const { equipoId } = useEquipoSeleccionado();
  const { equipos } = useEquipos();
  const { huertas } = useHuertas();
  const { productos } = useProductos(true, "Combustible");
  const equipoActual = equipos.find((e) => e.id === equipoId);
  const esTractor = equipoActual?.tipo === "tractor";

  const [cargas, setCargas] = useState<CombustibleCarga[]>([]);
  const [alertaHoras, setAlertaHoras] = useState<AlertaRendimiento | null>(null);
  const [alertaHectareas, setAlertaHectareas] = useState<AlertaRendimiento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const [fecha, setFecha] = useState(hoyISO());
  const [tipo, setTipo] = useState<"diesel_garrafa" | "gasolina_externa" | "diesel_externo">(esTractor ? "diesel_garrafa" : "gasolina_externa");
  const [odometro, setOdometro] = useState("");
  const [horometro, setHorometro] = useState("");
  const [litros, setLitros] = useState("");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [productoId, setProductoId] = useState("");
  const [huertaId, setHuertaId] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);

  useEffect(() => {
    setTipo(esTractor ? "diesel_garrafa" : "gasolina_externa");
  }, [esTractor]);

  function cargar() {
    if (!equipoId) return;
    api.get<CombustibleCarga[]>(`/equipos/combustible/${equipoId}`).then(setCargas);
    api.get<AlertaRendimiento | null>(`/equipos/combustible/${equipoId}/alerta-rendimiento`).then(setAlertaHoras);
    api.get<AlertaRendimiento | null>(`/equipos/combustible/${equipoId}/alerta-litros-por-hectarea`).then(setAlertaHectareas);
  }

  useEffect(cargar, [equipoId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (tipo === "diesel_garrafa" && !archivo) {
      setError("Falta la foto del relleno.");
      return;
    }
    setSubiendo(true);
    try {
      const fotoUrl = archivo ? await subirEvidencia(archivo) : undefined;
      await api.post(`/equipos/combustible/${equipoId}`, {
        fecha,
        tipo,
        odometro: odometro ? Number(odometro) : undefined,
        horometro: horometro ? Number(horometro) : undefined,
        litros: Number(litros),
        precioUnitario: precioUnitario ? Number(precioUnitario) : undefined,
        productoId: tipo === "diesel_garrafa" ? productoId : undefined,
        huertaId: tipo === "diesel_garrafa" ? huertaId : undefined,
        fotoUrl,
      });
      setOdometro("");
      setHorometro("");
      setLitros("");
      setPrecioUnitario("");
      setArchivo(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    } finally {
      setSubiendo(false);
    }
  }

  if (!equipoId) return <p style={{ color: "var(--ink-soft)" }}>No hay equipos dados de alta todavía.</p>;
  if (equipoActual?.tipo === "drone") return <p style={{ color: "var(--ink-soft)" }}>Este equipo funciona a batería — no lleva captura de combustible.</p>;
  if (equipoActual?.tipo === "motobomba") {
    return <p style={{ color: "var(--ink-soft)" }}>La gasolina de la Motobomba se captura desde Fertilizantes &gt; Fertirriego, ligada al día del fertirriego.</p>;
  }

  return (
    <div>
      {alertaHoras?.anomalo && (
        <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 10 }}>
          Consumo anómalo: {formatearNumero(alertaHoras.tasaActual, 2)} {alertaHoras.unidad} vs. promedio histórico {formatearNumero(alertaHoras.promedioHistorico, 2)}{" "}
          {alertaHoras.unidad} ({(alertaHoras.desviacionPorcentual * 100).toFixed(0)}%)
        </div>
      )}
      {alertaHectareas?.anomalo && (
        <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 16 }}>
          Consumo anómalo: {formatearNumero(alertaHectareas.tasaActual, 2)} {alertaHectareas.unidad} vs. promedio histórico{" "}
          {formatearNumero(alertaHectareas.promedioHistorico, 2)} {alertaHectareas.unidad} ({(alertaHectareas.desviacionPorcentual * 100).toFixed(0)}%)
        </div>
      )}

      <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
        <label className="field">
          Fecha
          <FechaInput value={fecha} onChange={setFecha} required />
        </label>
        <label className="field">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="diesel_garrafa">Diésel de garrafa (Almacén)</option>
            <option value="gasolina_externa">Gasolina externa</option>
            <option value="diesel_externo">Diésel externo</option>
          </select>
        </label>
        {tipo === "diesel_garrafa" ? (
          <label className="field">
            Horómetro
            <input type="number" step="0.1" value={horometro} onChange={(e) => setHorometro(e.target.value)} required />
          </label>
        ) : (
          <label className="field">
            Odómetro
            <input type="number" step="0.1" value={odometro} onChange={(e) => setOdometro(e.target.value)} required />
          </label>
        )}
        <label className="field">
          Litros
          <input type="number" step="0.01" value={litros} onChange={(e) => setLitros(e.target.value)} required />
        </label>
        {tipo === "diesel_garrafa" ? (
          <>
            <label className="field">
              Producto (Almacén)
              <select value={productoId} onChange={(e) => setProductoId(e.target.value)} required>
                <option value="">Selecciona…</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombreComercial}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Huerta (garrafa)
              <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)} required>
                <option value="">Selecciona…</option>
                {huertas.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Foto del relleno
              <input type="file" accept="image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} required />
            </label>
          </>
        ) : (
          <label className="field">
            Precio por litro
            <input type="number" step="0.01" value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} required />
          </label>
        )}
        <button className="btn-primary" type="submit" disabled={subiendo}>
          {subiendo ? "Guardando…" : "Registrar carga"}
        </button>
      </form>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Odómetro/Horómetro</th>
            <th>Litros</th>
            <th>Precio/L</th>
          </tr>
        </thead>
        <tbody>
          {cargas.map((c) => (
            <tr key={c.id}>
              <td>{formatearFecha(c.fecha)}</td>
              <td>{c.tipo}</td>
              <td>{c.odometro ?? c.horometro ?? "—"}</td>
              <td>{c.litros}</td>
              <td>{c.precioUnitario ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
