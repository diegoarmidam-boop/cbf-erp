import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import type { FertirriegoActivo, RiegoHuertaTodasUPs } from "../../lib/types";
import FechaInput from "../../components/FechaInput";
import { formatearNumero } from "../../lib/numero";

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface FilaEdit {
  horas: string;
  // "Inyección completa" (20-sep-2026): marcada = se metió todo lo
  // programado para esta Sección, sin capturar cantidades. Desmarcada = al
  // guardar se pregunta qué se metió de cada producto.
  inyeccionCompleta: boolean;
  // Comentario libre (8-sep-2026) — existe cualquier día.
  comentario: string;
}

// Diálogo de "no fue completa": cantidad realmente aplicada por producto
// (puede ser 0) y, solo si nada se metió, el motivo.
interface DialogoParcial {
  seccionId: string;
  nombreSeccion: string;
  fertirriego: FertirriegoActivo;
  cantidades: Record<string, string>;
  motivo: string;
}

const nombreProducto = (p: { ingredienteActivo: string | null; nombreComercial: string }) => p.ingredienteActivo ?? p.nombreComercial;
const TOLERANCIA = 0.0005;

export default function Riego() {
  const [searchParams] = useSearchParams();
  const [fecha, setFecha] = useState(searchParams.get("fecha") || hoyISO());
  const [datos, setDatos] = useState<RiegoHuertaTodasUPs[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [ediciones, setEdiciones] = useState<Record<string, FilaEdit>>({});
  const [dialogo, setDialogo] = useState<DialogoParcial | null>(null);
  const huertaResaltadaId = searchParams.get("huertaId");
  const refHuertaResaltada = useRef<HTMLDivElement>(null);
  const yaHizoScroll = useRef(false);

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
            // Un registro ya guardado cuenta como "completa" solo si se
            // aplicó exactamente lo programado de cada producto.
            const completa =
              !!fila.registro?.fertirriegoConfirmado &&
              !!fila.fertirriegoActivo &&
              fila.fertirriegoActivo.productos.every((p) => {
                const guardada = fila.registro!.productos.find((rp) => rp.productoId === p.id);
                return guardada != null && Math.abs(Number(guardada.cantidadAplicada) - p.cantidadPorRiego) <= TOLERANCIA;
              });
            nuevas[fila.seccion.id] = {
              horas: fila.registro ? fila.registro.horas : "",
              inyeccionCompleta: completa,
              comentario: fila.registro?.comentario ?? "",
            };
          }
        }
        setEdiciones(nuevas);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [fecha]);

  useEffect(() => {
    if (yaHizoScroll.current || !huertaResaltadaId || datos.length === 0) return;
    refHuertaResaltada.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    yaHizoScroll.current = true;
  }, [huertaResaltadaId, datos]);

  function actualizarFila(seccionId: string, campo: "horas" | "comentario", valor: string) {
    setEdiciones((prev) => ({ ...prev, [seccionId]: { ...prev[seccionId]!, [campo]: valor } }));
  }

  function alternarCompleta(seccionId: string, valor: boolean) {
    setEdiciones((prev) => ({ ...prev, [seccionId]: { ...prev[seccionId]!, inyeccionCompleta: valor } }));
  }

  async function enviar(seccionId: string, cuerpo: Record<string, unknown>): Promise<boolean> {
    setGuardandoId(seccionId);
    try {
      await api.post(`/riego/${seccionId}/${fecha}`, cuerpo);
      cargar();
      return true;
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo guardar.";
      if (dialogo) setErrorDialogo(mensaje);
      else setError(mensaje);
      return false;
    } finally {
      setGuardandoId(null);
    }
  }

  async function guardarFila(seccionId: string, nombreSeccion: string, fertirriego: FertirriegoActivo | null) {
    const fila = ediciones[seccionId];
    if (!fila) return;
    setError(null);
    const base = { horas: Number(fila.horas), comentario: fila.comentario.trim() || undefined };

    if (!fertirriego) {
      await enviar(seccionId, { ...base, fertirriegoConfirmado: false });
      return;
    }
    if (fila.inyeccionCompleta) {
      await enviar(seccionId, {
        ...base,
        fertirriegoConfirmado: true,
        cantidadesAplicadas: fertirriego.productos.map((p) => ({ productoId: p.id, cantidadAplicada: p.cantidadPorRiego })),
      });
      return;
    }
    // No completa: se pregunta qué se metió. Arranca con lo ya guardado hoy
    // o, si no hay registro, con lo programado (solo se corrige lo que cambió).
    const registro = datos.flatMap((h) => h.secciones).find((s) => s.seccion.id === seccionId)?.registro;
    const cantidades: Record<string, string> = {};
    for (const p of fertirriego.productos) {
      const guardada = registro?.fertirriegoConfirmado ? registro.productos.find((rp) => rp.productoId === p.id) : undefined;
      cantidades[p.id] = String(guardada ? Number(guardada.cantidadAplicada) : p.cantidadPorRiego);
    }
    setErrorDialogo(null);
    setDialogo({ seccionId, nombreSeccion, fertirriego, cantidades, motivo: registro?.motivoNoAplicado ?? "" });
  }

  async function confirmarParcial() {
    if (!dialogo) return;
    const fila = ediciones[dialogo.seccionId];
    if (!fila) return;
    const cantidades = dialogo.fertirriego.productos.map((p) => ({ productoId: p.id, cantidadAplicada: Number(dialogo.cantidades[p.id] ?? 0) }));
    if (cantidades.some((c) => !Number.isFinite(c.cantidadAplicada) || c.cantidadAplicada < 0)) {
      setErrorDialogo("Las cantidades deben ser 0 o mayores.");
      return;
    }
    const nadaSeMetio = cantidades.every((c) => c.cantidadAplicada === 0);
    if (nadaSeMetio && !dialogo.motivo.trim()) {
      setErrorDialogo("Si no se metió nada, escribe el motivo.");
      return;
    }
    const ok = await enviar(dialogo.seccionId, {
      horas: Number(fila.horas),
      comentario: fila.comentario.trim() || undefined,
      fertirriegoConfirmado: !nadaSeMetio,
      cantidadesAplicadas: nadaSeMetio ? undefined : cantidades,
      motivoNoAplicado: nadaSeMetio ? dialogo.motivo.trim() : undefined,
    });
    if (ok) setDialogo(null);
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
            <div
              key={huerta.id}
              className="card"
              ref={huerta.id === huertaResaltadaId ? refHuertaResaltada : undefined}
              style={huerta.id === huertaResaltadaId ? { outline: "2px solid var(--pink)", outlineOffset: 2 } : undefined}
            >
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
                      <th>Comentario</th>
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
                              min={0}
                              step="any"
                              inputMode="decimal"
                              style={{ width: 90 }}
                              value={fila.horas}
                              onChange={(e) => actualizarFila(seccion.id, "horas", e.target.value)}
                            />
                          </td>
                          <td>
                            {fertirriegoActivo ? (
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                <input type="checkbox" checked={fila.inyeccionCompleta} onChange={(e) => alternarCompleta(seccion.id, e.target.checked)} />
                                Inyección completa
                              </label>
                            ) : (
                              <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Sin fertirriego programado hoy</span>
                            )}
                          </td>
                          <td>
                            <input
                              placeholder="Observación (opcional)"
                              style={{ width: 160 }}
                              value={fila.comentario}
                              onChange={(e) => actualizarFila(seccion.id, "comentario", e.target.value)}
                            />
                          </td>
                          <td>
                            <button
                              className="btn-primary"
                              onClick={() => guardarFila(seccion.id, seccion.nombre, fertirriegoActivo)}
                              disabled={guardandoId === seccion.id}
                            >
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

      {dialogo && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 12 }}
        >
          <div className="card" style={{ width: 460, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ marginBottom: 6 }}>{dialogo.nombreSeccion}: ¿qué se metió?</h3>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
              La inyección no se marcó como completa. Deja lo que sí se metió tal cual y corrige lo que cambió (pon 0 si no se metió).
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dialogo.fertirriego.productos.map((p) => (
                <label key={p.id} className="field">
                  {nombreProducto(p)} — programado {formatearNumero(p.cantidadPorRiego)} {p.unidad}
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={dialogo.cantidades[p.id] ?? ""}
                    onChange={(e) => setDialogo({ ...dialogo, cantidades: { ...dialogo.cantidades, [p.id]: e.target.value } })}
                  />
                </label>
              ))}
              <label className="field">
                Motivo (obligatorio solo si no se metió nada)
                <input value={dialogo.motivo} onChange={(e) => setDialogo({ ...dialogo, motivo: e.target.value })} />
              </label>
            </div>
            {errorDialogo && <p style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 8 }}>{errorDialogo}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setDialogo(null)} disabled={guardandoId === dialogo.seccionId}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={confirmarParcial} disabled={guardandoId === dialogo.seccionId}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
