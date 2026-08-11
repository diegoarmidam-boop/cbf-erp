import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { RiegoHuertaTodasUPs } from "../../lib/types";
import FechaInput from "../../components/FechaInput";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FilaEdit {
  horas: string;
  fertirriegoConfirmado: boolean;
  cantidadAplicada: string;
  motivoNoAplicado: string;
}

export default function Riego() {
  const [fecha, setFecha] = useState(hoyISO());
  const [datos, setDatos] = useState<RiegoHuertaTodasUPs[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [ediciones, setEdiciones] = useState<Record<string, FilaEdit>>({});

  function cargar() {
    setCargando(true);
    setError(null);
    api
      .get<RiegoHuertaTodasUPs[]>(`/riego/todas-ups/${fecha}`)
      .then((r) => {
        setDatos(r);
        const nuevas: Record<string, FilaEdit> = {};
        for (const h of r) {
          for (const fila of h.secciones) {
            nuevas[fila.seccion.id] = {
              horas: fila.registro ? fila.registro.horas : "",
              fertirriegoConfirmado: fila.registro?.fertirriegoConfirmado ?? false,
              cantidadAplicada: fila.registro?.cantidadAplicada ?? "",
              motivoNoAplicado: fila.registro?.motivoNoAplicado ?? "",
            };
          }
        }
        setEdiciones(nuevas);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [fecha]);

  function actualizarFila(seccionId: string, campo: keyof FilaEdit, valor: string | boolean) {
    setEdiciones((prev) => ({ ...prev, [seccionId]: { ...prev[seccionId]!, [campo]: valor } }));
  }

  async function guardarFila(seccionId: string) {
    const fila = ediciones[seccionId];
    if (!fila) return;
    setError(null);
    setGuardandoId(seccionId);
    try {
      await api.post(`/riego/${seccionId}/${fecha}`, {
        horas: Number(fila.horas),
        fertirriegoConfirmado: fila.fertirriegoConfirmado,
        cantidadAplicada: fila.fertirriegoConfirmado ? Number(fila.cantidadAplicada) : undefined,
        motivoNoAplicado: !fila.fertirriegoConfirmado ? fila.motivoNoAplicado || undefined : undefined,
      });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setGuardandoId(null);
    }
  }

  return (
    <div>
      <label className="field" style={{ maxWidth: 200, marginBottom: 18 }}>
        Fecha
        <FechaInput value={fecha} onChange={setFecha} />
      </label>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {datos.map(({ huerta, secciones }) => (
            <div key={huerta.id} className="card">
              <h3 style={{ marginBottom: 10 }}>{huerta.nombre}</h3>
              {secciones.length === 0 ? (
                <p style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>Sin Secciones de Riego dadas de alta.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Sección</th>
                      <th>Horas regadas</th>
                      <th>Fertirriego</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {secciones.map(({ seccion, fertirriegoActivo }) => {
                      const fila = ediciones[seccion.id];
                      if (!fila) return null;
                      return (
                        <tr key={seccion.id}>
                          <td>{seccion.nombre}</td>
                          <td>
                            <input
                              type="number"
                              step="0.25"
                              min={0}
                              style={{ width: 80 }}
                              value={fila.horas}
                              onChange={(e) => actualizarFila(seccion.id, "horas", e.target.value)}
                            />
                          </td>
                          <td>
                            {fertirriegoActivo ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                  <input
                                    type="checkbox"
                                    checked={fila.fertirriegoConfirmado}
                                    onChange={(e) => actualizarFila(seccion.id, "fertirriegoConfirmado", e.target.checked)}
                                  />
                                  ¿Se metió? ({fertirriegoActivo.producto.nombreComercial})
                                </label>
                                {fila.fertirriegoConfirmado ? (
                                  <input
                                    type="number"
                                    step="0.0001"
                                    placeholder={`Cantidad (${fertirriegoActivo.producto.unidad})`}
                                    style={{ width: 160 }}
                                    value={fila.cantidadAplicada}
                                    onChange={(e) => actualizarFila(seccion.id, "cantidadAplicada", e.target.value)}
                                  />
                                ) : (
                                  <input
                                    placeholder="Motivo por el que no se metió (obligatorio)"
                                    style={{ width: 220 }}
                                    value={fila.motivoNoAplicado}
                                    onChange={(e) => actualizarFila(seccion.id, "motivoNoAplicado", e.target.value)}
                                  />
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Sin fertirriego programado hoy</span>
                            )}
                          </td>
                          <td>
                            <button className="btn-primary" onClick={() => guardarFila(seccion.id)} disabled={guardandoId === seccion.id}>
                              Guardar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ))}
          {datos.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay Huertas activas.</p>}
        </div>
      )}
    </div>
  );
}
