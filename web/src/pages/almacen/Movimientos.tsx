import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useProductos } from "../../lib/useProductos";
import { useHuertas } from "../../lib/useHuertas";
import { nombreConMarca } from "../../lib/producto";
import FechaInput from "../../components/FechaInput";

type Accion = "entrada" | "entregar" | "salida";
type TipoSalida = "prestamo_rancho" | "merma" | "baja_caducidad" | "abono_sobrante" | "ajuste_manual";

export default function Movimientos() {
  const { productos } = useProductos(true);
  const { huertas } = useHuertas();
  // Existencia en Almacén Central por producto (P2, V1 20-sep-2026): Salida y
  // Entregar solo ofrecen productos con existencia > 0; Entrada sigue con
  // todo el catálogo (ahí es donde llega producto que aún no tiene).
  const [existencia, setExistencia] = useState<Record<string, number>>({});
  function cargarExistencia() {
    api.get<Record<string, number>>("/almacen/movimientos/stock-todos").then(setExistencia).catch(() => {});
  }
  useEffect(cargarExistencia, []);
  const [accion, setAccion] = useState<Accion>("entrada");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [lote, setLote] = useState("");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [motivoEntrada, setMotivoEntrada] = useState("");
  const [fechaCaducidad, setFechaCaducidad] = useState("");
  const [huertaId, setHuertaId] = useState("");
  const [tipoSalida, setTipoSalida] = useState<TipoSalida>("merma");
  const [motivoAjuste, setMotivoAjuste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  // Número de Lote de Almacén asignado por el sistema (V1 P1, 25-sep-2026,
  // regla a) al confirmar una Entrada manual.
  const [loteAsignado, setLoteAsignado] = useState<number | null>(null);

  // ---- Elegir otro lote al Entregar a Huerta (V1 P1, 25-sep-2026, regla e) ----
  interface LoteProducto { id: string; numeroLote: number | null; cantidadActual: string; fechaLlegada: string }
  const [lotesProducto, setLotesProducto] = useState<LoteProducto[]>([]);
  const [loteElegido, setLoteElegido] = useState("");
  const [motivoOtroLote, setMotivoOtroLote] = useState("");
  useEffect(() => {
    if (accion === "entregar" && productoId) {
      api.get<{ total: number; lotes: LoteProducto[] }>(`/almacen/movimientos/${productoId}/stock`).then((r) => setLotesProducto(r.lotes));
    } else {
      setLotesProducto([]);
    }
    setLoteElegido("");
    setMotivoOtroLote("");
  }, [accion, productoId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    setLoteAsignado(null);
    try {
      if (accion === "entrada") {
        const resultado = await api.post<{ numeroLote: number | null }>("/almacen/movimientos/entrada", {
          productoId,
          cantidad: Number(cantidad),
          precioUnitario: Number(precioUnitario),
          motivo: motivoEntrada,
          lote: lote || undefined,
          fechaCaducidad: fechaCaducidad || undefined,
        });
        if (resultado.numeroLote != null) setLoteAsignado(resultado.numeroLote);
      } else if (accion === "entregar") {
        if (loteElegido && !motivoOtroLote.trim()) {
          setError("Captura el motivo de por qué se eligió otro lote.");
          return;
        }
        await api.post("/almacen/movimientos/entregar-a-huerta", {
          productoId,
          huertaId,
          cantidad: Number(cantidad),
          loteIdElegido: loteElegido || undefined,
          motivoOtroLote: loteElegido ? motivoOtroLote : undefined,
        });
      } else {
        await api.post("/almacen/movimientos/salida", {
          productoId,
          tipo: tipoSalida,
          cantidad: Number(cantidad),
          motivoAjuste: motivoAjuste || undefined,
        });
      }
      setMensaje("Movimiento registrado.");
      cargarExistencia();
      setCantidad("");
      setLote("");
      setPrecioUnitario("");
      setMotivoEntrada("");
      setMotivoAjuste("");
      setLoteElegido("");
      setMotivoOtroLote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <button className={accion === "entrada" ? "btn-primary" : "btn-secondary"} onClick={() => { setAccion("entrada"); setProductoId(""); }}>
          Entrada (compra recibida)
        </button>
        <button className={accion === "entregar" ? "btn-primary" : "btn-secondary"} onClick={() => { setAccion("entregar"); setProductoId(""); }}>
          Entregar a Huerta
        </button>
        <button className={accion === "salida" ? "btn-primary" : "btn-secondary"} onClick={() => { setAccion("salida"); setProductoId(""); }}>
          Salida (merma/préstamo/ajuste)
        </button>
      </div>

      {loteAsignado != null && (
        <div
          className="card"
          style={{ marginBottom: 14, textAlign: "center", padding: "20px 16px", border: "2px solid var(--pink, #c0396b)" }}
        >
          <div style={{ fontSize: 28, fontWeight: 800, margin: "6px 0" }}>Escribe LOTE {loteAsignado}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>
            Marca este número a mano en el producto que acaba de llegar.
          </div>
          <button className="btn-secondary" onClick={() => setLoteAsignado(null)}>
            Listo, ya lo marqué
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="field">
          Producto (autorizado)
          <select value={productoId} onChange={(e) => setProductoId(e.target.value)} required>
            <option value="">Selecciona…</option>
            {productos.filter((p) => accion === "entrada" || (existencia[p.id] ?? 0) > 0).map((p) => (
              <option key={p.id} value={p.id}>
                {nombreConMarca(p)}
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
              Precio unitario (MXN)
              <input type="number" min={0} step="0.0001" value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} required />
            </label>
            <label className="field">
              Motivo (por qué no viene de una Orden de Compra)
              <input value={motivoEntrada} onChange={(e) => setMotivoEntrada(e.target.value)} required style={{ minWidth: 260 }} />
            </label>
            <label className="field">
              Lote del proveedor
              <input value={lote} onChange={(e) => setLote(e.target.value)} placeholder="Opcional" />
            </label>
            <label className="field">
              Caducidad
              <FechaInput value={fechaCaducidad} onChange={setFechaCaducidad} />
            </label>
          </>
        )}

        {accion === "entregar" && (
          <>
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
            {lotesProducto.length > 0 && (
              <label className="field">
                Lote (default: el más antiguo con existencia)
                <select value={loteElegido} onChange={(e) => setLoteElegido(e.target.value)}>
                  <option value="">Automático (FIFO por fecha de llegada)</option>
                  {lotesProducto
                    .filter((l) => Number(l.cantidadActual) > 0)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        Lote {l.numeroLote ?? "?"} — existencia {l.cantidadActual}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {loteElegido && (
              <label className="field" style={{ minWidth: 200 }}>
                Motivo de elegir otro lote
                <input value={motivoOtroLote} onChange={(e) => setMotivoOtroLote(e.target.value)} required />
              </label>
            )}
          </>
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
