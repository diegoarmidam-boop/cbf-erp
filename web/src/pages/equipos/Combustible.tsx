import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useProductos } from "../../lib/useProductos";
import { useEquipos } from "../../lib/useEquipos";
import { useEquipoSeleccionado } from "./EquipoSeleccionadoContext";
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
  const { productos } = useProductos(true);
  const equipoActual = equipos.find((e) => e.id === equipoId);
  const esTractor = equipoActual?.tipo === "tractor";

  const [cargas, setCargas] = useState<CombustibleCarga[]>([]);
  const [alerta, setAlerta] = useState<AlertaRendimiento | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fecha, setFecha] = useState(hoyISO());
  const [tipo, setTipo] = useState<"diesel_garrafa" | "gasolina_externa" | "diesel_externo">(esTractor ? "diesel_garrafa" : "gasolina_externa");
  const [odometro, setOdometro] = useState("");
  const [horometro, setHorometro] = useState("");
  const [litros, setLitros] = useState("");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [productoId, setProductoId] = useState("");

  useEffect(() => {
    setTipo(esTractor ? "diesel_garrafa" : "gasolina_externa");
  }, [esTractor]);

  function cargar() {
    if (!equipoId) return;
    api.get<CombustibleCarga[]>(`/equipos/combustible/${equipoId}`).then(setCargas);
    api.get<AlertaRendimiento | null>(`/equipos/combustible/${equipoId}/alerta-rendimiento`).then(setAlerta);
  }

  useEffect(cargar, [equipoId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/equipos/combustible/${equipoId}`, {
        fecha,
        tipo,
        odometro: odometro ? Number(odometro) : undefined,
        horometro: horometro ? Number(horometro) : undefined,
        litros: Number(litros),
        precioUnitario: precioUnitario ? Number(precioUnitario) : undefined,
        productoId: tipo === "diesel_garrafa" ? productoId : undefined,
      });
      setOdometro("");
      setHorometro("");
      setLitros("");
      setPrecioUnitario("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    }
  }

  if (!equipoId) return <p style={{ color: "var(--ink-soft)" }}>No hay equipos dados de alta todavía.</p>;

  return (
    <div>
      {alerta?.anomalo && (
        <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 16 }}>
          Consumo anómalo: {formatearNumero(alerta.tasaActual, 2)} {alerta.unidad} vs. promedio histórico {formatearNumero(alerta.promedioHistorico, 2)}{" "}
          {alerta.unidad} ({(alerta.desviacionPorcentual * 100).toFixed(0)}%)
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
        ) : (
          <label className="field">
            Precio por litro
            <input type="number" step="0.01" value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} required />
          </label>
        )}
        <button className="btn-primary" type="submit">
          Registrar carga
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
