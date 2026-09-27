import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { formatearFecha } from "../../lib/fecha";
import { formatearDinero, formatearNumero } from "../../lib/numero";

interface FleteLinea {
  id: string;
  producto: { nombreComercial: string; unidad: string };
  proveedor: { nombre: string } | null;
  cantidadSolicitada: string;
}

interface FletePendiente {
  id: string;
  numero: number;
  vinoConFlete: boolean;
  fechaMarcado: string | null;
  fechaCreacion: string;
  completo: boolean;
  lineas: FleteLinea[];
}

export default function Flete() {
  const [fletes, setFletes] = useState<FletePendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [montoPorFolio, setMontoPorFolio] = useState<Record<number, string>>({});
  const [capturando, setCapturando] = useState<number | null>(null);

  const [searchParams] = useSearchParams();
  const numeroResaltado = searchParams.get("numero");
  const refResaltado = useRef<HTMLDivElement>(null);

  function cargar() {
    setCargando(true);
    api
      .get<FletePendiente[]>("/compras/ordenes/flete/pendientes")
      .then(setFletes)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }
  useEffect(cargar, []);

  useEffect(() => {
    if (numeroResaltado) refResaltado.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [numeroResaltado, fletes]);

  async function capturar(numero: number) {
    const montoTotal = Number(montoPorFolio[numero]);
    if (!montoTotal || montoTotal <= 0) {
      setError("Captura el monto total del flete de esta orden.");
      return;
    }
    if (!confirm(`¿Confirmar flete de ${formatearDinero(montoTotal)} para el folio ${numero}? Esto sube el costo de los lotes de esta orden.`)) return;
    setError(null);
    setCapturando(numero);
    try {
      await api.post("/compras/ordenes/flete/capturar", { numero, montoTotal });
      setMontoPorFolio((prev) => ({ ...prev, [numero]: "" }));
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo capturar el flete.");
    } finally {
      setCapturando(null);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
        El flete es parte del costo real del producto hasta la Huerta — se reparte por kilo (1 L cuenta como 1 kg; los productos en pieza
        quedan fuera del reparto) entre los lotes de esta orden, y ajusta el costo de lo que ya hubiera salido a una Huerta. Nunca entra a
        Cuentas por Pagar. Solo se puede capturar cuando ya llegaron todas las líneas de la orden.
      </p>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : fletes.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>No hay órdenes marcadas con flete pendiente de capturar.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {fletes.map((f) => (
            <div
              key={f.id}
              ref={String(f.numero) === numeroResaltado ? refResaltado : undefined}
              className="card"
              style={String(f.numero) === numeroResaltado ? { outline: "2px solid var(--pink)" } : undefined}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>
                  Folio {f.numero}{" "}
                  {f.completo ? (
                    <span className="tag tag-success" style={{ marginLeft: 6 }}>
                      Completo — listo para capturar
                    </span>
                  ) : (
                    <span className="tag tag-warning" style={{ marginLeft: 6 }}>
                      Faltan líneas por recibir
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Marcado {formatearFecha(f.fechaMarcado ?? f.fechaCreacion)}</span>
              </div>

              <table style={{ marginBottom: 10 }}>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Proveedor</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {f.lineas.map((l) => (
                    <tr key={l.id}>
                      <td>{l.producto.nombreComercial}</td>
                      <td>{l.proveedor?.nombre ?? "—"}</td>
                      <td>
                        {formatearNumero(l.cantidadSolicitada)} {l.producto.unidad}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {f.completo && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <label className="field" style={{ maxWidth: 200 }}>
                    Flete total ($)
                    <input
                      type="number"
                      step="0.01"
                      value={montoPorFolio[f.numero] ?? ""}
                      onChange={(e) => setMontoPorFolio((prev) => ({ ...prev, [f.numero]: e.target.value }))}
                    />
                  </label>
                  <button className="btn-primary" disabled={capturando === f.numero} onClick={() => capturar(f.numero)}>
                    {capturando === f.numero ? "Guardando…" : "Capturar flete"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
