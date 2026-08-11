import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useProductos } from "../../lib/useProductos";
import { useHuertas } from "../../lib/useHuertas";
import { presentacionTexto } from "../../lib/producto";
import FechaInput from "../../components/FechaInput";

type Accion = "entrada" | "entregar" | "salida";
type TipoSalida = "prestamo_rancho" | "merma" | "baja_caducidad" | "abono_sobrante" | "ajuste_manual";

export default function Movimientos() {
  const { productos } = useProductos(true);
  const { huertas } = useHuertas();
  const [accion, setAccion] = useState<Accion>("entrada");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [lote, setLote] = useState("");
  const [fechaCaducidad, setFechaCaducidad] = useState("");
  const [huertaId, setHuertaId] = useState("");
  const [tipoSalida, setTipoSalida] = useState<TipoSalida>("merma");
  const [motivoAjuste, setMotivoAjuste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    try {
      if (accion === "entrada") {
        await api.post("/almacen/movimientos/entrada", {
          productoId,
          cantidad: Number(cantidad),
          lote: lote || undefined,
          fechaCaducidad: fechaCaducidad || undefined,
        });
      } else if (accion === "entregar") {
        await api.post("/almacen/movimientos/entregar-a-huerta", { productoId, huertaId, cantidad: Number(cantidad) });
      } else {
        await api.post("/almacen/movimientos/salida", {
          productoId,
          tipo: tipoSalida,
          cantidad: Number(cantidad),
          motivoAjuste: motivoAjuste || undefined,
        });
      }
      setMensaje("Movimiento registrado.");
      setCantidad("");
      setLote("");
      setMotivoAjuste("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <button className={accion === "entrada" ? "btn-primary" : "btn-secondary"} onClick={() => setAccion("entrada")}>
          Entrada (compra recibida)
        </button>
        <button className={accion === "entregar" ? "btn-primary" : "btn-secondary"} onClick={() => setAccion("entregar")}>
          Entregar a Huerta
        </button>
        <button className={accion === "salida" ? "btn-primary" : "btn-secondary"} onClick={() => setAccion("salida")}>
          Salida (merma/préstamo/ajuste)
        </button>
      </div>

      <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="field">
          Producto (autorizado)
          <select value={productoId} onChange={(e) => setProductoId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombreComercial} ({presentacionTexto(p)})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Cantidad
          <input type="number" step="0.001" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
        </label>

        {accion === "entrada" && (
          <>
            <label className="field">
              Lote
              <input value={lote} onChange={(e) => setLote(e.target.value)} placeholder="Opcional" />
            </label>
            <label className="field">
              Caducidad
              <FechaInput value={fechaCaducidad} onChange={setFechaCaducidad} />
            </label>
          </>
        )}

        {accion === "entregar" && (
          <label className="field">
            Huerta destino
            <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)} required>
              <option value="">Selecciona…</option>
              {huertas.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        {accion === "salida" && (
          <>
            <label className="field">
              Motivo
              <select value={tipoSalida} onChange={(e) => setTipoSalida(e.target.value as TipoSalida)}>
                <option value="prestamo_rancho">Préstamo a otro rancho</option>
                <option value="merma">Merma</option>
                <option value="baja_caducidad">Baja por caducidad</option>
                <option value="abono_sobrante">Abono de sobrante</option>
                <option value="ajuste_manual">Ajuste manual</option>
              </select>
            </label>
            {(tipoSalida === "merma" || tipoSalida === "ajuste_manual") && (
              <label className="field">
                Motivo detallado (obligatorio)
                <input value={motivoAjuste} onChange={(e) => setMotivoAjuste(e.target.value)} required />
              </label>
            )}
          </>
        )}

        <button className="btn-primary" type="submit">
          Registrar
        </button>
      </form>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginTop: 12 }}>{error}</div>}
      {mensaje && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px", marginTop: 12 }}>{mensaje}</div>}
    </div>
  );
}
