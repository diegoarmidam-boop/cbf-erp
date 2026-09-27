import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { usePuestos } from "../../lib/usePuestos";
import { useHuertas } from "../../lib/useHuertas";
import type { Personal as PersonalT } from "../../lib/types";
import { formatearFecha } from "../../lib/fecha";

/**
 * Bandeja de RH (V1 P6, 27-sep-2026, 9.11a): personas dadas de alta desde
 * "+ Nueva persona" en Captura del día — activas de inmediato (su costo ya
 * cuenta para la Huerta), pero sin cobrar hasta que RH complete sus datos
 * y autorice aquí. Lo ganado mientras tanto se acumula solo al primer
 * reporte de Nómina ya autorizado (ver reporte.ts, nominaPagadaHasta).
 */
export default function AltasPendientes() {
  const { puestos } = usePuestos();
  const { huertas } = useHuertas();
  const [pendientes, setPendientes] = useState<PersonalT[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [autorizando, setAutorizando] = useState<string | null>(null);

  const [tipo, setTipo] = useState<"fijo" | "destajo">("destajo");
  const [huertaId, setHuertaId] = useState("");
  const [puestoId, setPuestoId] = useState("");
  const [sueldo, setSueldo] = useState("");
  const [diaPagoMensual, setDiaPagoMensual] = useState<"primer_viernes" | "ultimo_viernes" | "">("");
  const [formaPago, setFormaPago] = useState<"efectivo" | "transferencia">("efectivo");
  const [banco, setBanco] = useState("");
  const [numeroCuentaOClabe, setNumeroCuentaOClabe] = useState("");
  const [titularCuenta, setTitularCuenta] = useState("");

  const puestoSeleccionado = puestos.find((p) => p.id === puestoId);
  const esMensual = puestoSeleccionado?.periodicidad === "mensual";

  function cargar() {
    setCargando(true);
    api
      .get<PersonalT[]>("/personal/altas-pendientes")
      .then(setPendientes)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }
  useEffect(cargar, []);

  function abrirEditar(p: PersonalT) {
    setEditandoId(p.id);
    setTipo(p.tipo);
    setHuertaId(p.huertaId ?? "");
    setPuestoId(p.puestoId ?? "");
    setSueldo(p.sueldo ?? "");
    setDiaPagoMensual(p.diaPagoMensual ?? "");
    setFormaPago(p.formaPago ?? "efectivo");
    setBanco(p.banco ?? "");
    setNumeroCuentaOClabe(p.numeroCuentaOClabe ?? "");
    setTitularCuenta(p.titularCuenta ?? "");
    setError(null);
  }

  async function guardarDatos(id: string) {
    setError(null);
    try {
      await api.patch(`/personal/${id}`, {
        tipo,
        huertaId: huertaId || undefined,
        puestoId: tipo === "fijo" ? puestoId || undefined : undefined,
        sueldo: tipo === "fijo" && sueldo ? Number(sueldo) : undefined,
        diaPagoMensual: tipo === "fijo" && esMensual && diaPagoMensual ? diaPagoMensual : undefined,
        formaPago: tipo === "fijo" ? formaPago : undefined,
        banco: tipo === "fijo" && formaPago === "transferencia" ? banco || undefined : undefined,
        numeroCuentaOClabe: tipo === "fijo" && formaPago === "transferencia" ? numeroCuentaOClabe || undefined : undefined,
        titularCuenta: tipo === "fijo" && formaPago === "transferencia" ? titularCuenta || undefined : undefined,
      });
      setEditandoId(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  async function autorizar(id: string) {
    if (!confirm("¿Autorizar el alta de esta persona? A partir de ahora sí saldrá en el pago de Nómina.")) return;
    setError(null);
    setAutorizando(id);
    try {
      await api.post(`/personal/${id}/autorizar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo autorizar.");
    } finally {
      setAutorizando(null);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
        Su costo ya cuenta para la Huerta desde que se capturó — pero no sale en ningún pago hasta que se autorice aquí. Lo que gane
        mientras tanto se acumula al primer pago ya autorizado.
      </p>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : pendientes.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>No hay altas pendientes de autorizar.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pendientes.map((p) => (
            <div key={p.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.nombreCompleto}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    Ingresó {p.fechaIngreso ? formatearFecha(p.fechaIngreso) : "—"} · {p.tipo}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {editandoId !== p.id && (
                    <button className="btn-secondary" onClick={() => abrirEditar(p)}>
                      Completar datos
                    </button>
                  )}
                  <button className="btn-primary" disabled={autorizando === p.id} onClick={() => autorizar(p.id)}>
                    {autorizando === p.id ? "Autorizando…" : "Autorizar"}
                  </button>
                </div>
              </div>

              {editandoId === p.id && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <label className="field">
                    Tipo
                    <select value={tipo} onChange={(e) => setTipo(e.target.value as "fijo" | "destajo")}>
                      <option value="destajo">Destajo / eventual</option>
                      <option value="fijo">Fijo</option>
                    </select>
                  </label>
                  <label className="field">
                    Huerta base
                    <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)}>
                      <option value="">—</option>
                      {huertas.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  {tipo === "fijo" && (
                    <>
                      <label className="field">
                        Puesto
                        <select value={puestoId} onChange={(e) => setPuestoId(e.target.value)}>
                          <option value="">—</option>
                          {puestos.map((pu) => (
                            <option key={pu.id} value={pu.id}>
                              {pu.nombre} ({pu.periodicidad})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Sueldo anual
                        <input type="number" step="0.01" value={sueldo} onChange={(e) => setSueldo(e.target.value)} />
                      </label>
                      {esMensual && (
                        <label className="field">
                          Día de pago (ya no se puede cambiar después)
                          <select value={diaPagoMensual} onChange={(e) => setDiaPagoMensual(e.target.value as typeof diaPagoMensual)}>
                            <option value="">Selecciona…</option>
                            <option value="primer_viernes">Primer viernes (paga el mes que empieza)</option>
                            <option value="ultimo_viernes">Último viernes (paga el mes que termina)</option>
                          </select>
                        </label>
                      )}
                      <label className="field">
                        Forma de pago
                        <select value={formaPago} onChange={(e) => setFormaPago(e.target.value as typeof formaPago)}>
                          <option value="efectivo">Efectivo</option>
                          {esMensual && <option value="transferencia">Transferencia</option>}
                        </select>
                      </label>
                      {formaPago === "transferencia" && (
                        <>
                          <label className="field">
                            Banco
                            <input value={banco} onChange={(e) => setBanco(e.target.value)} />
                          </label>
                          <label className="field">
                            Cuenta o CLABE
                            <input value={numeroCuentaOClabe} onChange={(e) => setNumeroCuentaOClabe(e.target.value)} />
                          </label>
                          <label className="field">
                            Titular
                            <input value={titularCuenta} onChange={(e) => setTitularCuenta(e.target.value)} />
                          </label>
                        </>
                      )}
                    </>
                  )}
                  <button className="btn-primary" onClick={() => guardarDatos(p.id)}>
                    Guardar
                  </button>
                  <button className="btn-secondary" onClick={() => setEditandoId(null)}>
                    Cancelar
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
