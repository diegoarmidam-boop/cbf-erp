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
  // "Inyección completa": marcada = se metió todo lo programado para esta
  // Sección, sin capturar cantidades. Desmarcada (y con fertirriego
  // programado) = al guardar se pregunta qué se metió de cada producto.
  inyeccionCompleta: boolean;
  comentario: string;
  // Solo se guardan las filas que se tocaron — no se reescribe lo que ya estaba.
  sucia: boolean;
}

interface CuerpoRiego {
  horas: number;
  comentario?: string;
  fertirriegoConfirmado: boolean;
  cantidadesAplicadas?: { productoId: string; cantidadAplicada: number }[];
  motivoNoAplicado?: string;
}

// Válvula que necesita respuesta antes de guardar (fertirriego sin "Inyección completa").
interface PreguntaParcial {
  seccionId: string;
  nombreSeccion: string;
  fertirriego: FertirriegoActivo;
}

const nombreProducto = (p: { ingredienteActivo: string | null; nombreComercial: string }) => p.ingredienteActivo ?? p.nombreComercial;
const TOLERANCIA = 0.0005;

/**
 * Captura diaria de Riego (9.6). Se guarda TODO el reporte del día de un
 * jalón (V1, 21-sep-2026): se capturan horas de todas las Secciones, se
 * marcan las de "Inyección completa" y un solo "Guardar todo" envía lo que
 * se tocó. Por cada Sección con fertirriego programado que NO se marcó
 * completa, primero se pregunta qué se metió (una por una) y al final se
 * guarda todo junto.
 */
export default function Riego() {
  const [searchParams] = useSearchParams();
  const [fecha, setFecha] = useState(searchParams.get("fecha") || hoyISO());
  const [datos, setDatos] = useState<RiegoHuertaTodasUPs[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [ediciones, setEdiciones] = useState<Record<string, FilaEdit>>({});

  // Flujo de preguntas encadenadas.
  const [cola, setCola] = useState<PreguntaParcial[]>([]);
  const [indice, setIndice] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<string, CuerpoRiego>>({});
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");

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
              sucia: false,
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

  function actualizarFila(seccionId: string, cambios: Partial<FilaEdit>) {
    setEdiciones((prev) => ({ ...prev, [seccionId]: { ...prev[seccionId]!, ...cambios, sucia: true } }));
    setMensaje(null);
  }

  const filasPlanas = datos.flatMap((h) => h.secciones.map((s) => ({ huertaNombre: h.huerta.nombre, ...s })));
  const cuantasSucias = Object.values(ediciones).filter((e) => e.sucia).length;

  // ---- Guardar todo ----

  async function guardarTodo() {
    setError(null);
    setMensaje(null);
    const sucias = filasPlanas.filter((f) => ediciones[f.seccion.id]?.sucia);
    if (sucias.length === 0) {
      setError("No hay cambios que guardar.");
      return;
    }
    const sinHoras = sucias.filter((f) => ediciones[f.seccion.id]!.horas.trim() === "" || !(Number(ediciones[f.seccion.id]!.horas) >= 0));
    if (sinHoras.length > 0) {
      setError(`Falta capturar las horas de: ${sinHoras.map((f) => f.seccion.nombre).join(", ")}.`);
      return;
    }

    const directas: Record<string, CuerpoRiego> = {};
    const preguntas: PreguntaParcial[] = [];
    for (const f of sucias) {
      const e = ediciones[f.seccion.id]!;
      const base = { horas: Number(e.horas), comentario: e.comentario.trim() || undefined };
      if (!f.fertirriegoActivo) {
        directas[f.seccion.id] = { ...base, fertirriegoConfirmado: false };
      } else if (e.inyeccionCompleta) {
        directas[f.seccion.id] = {
          ...base,
          fertirriegoConfirmado: true,
          cantidadesAplicadas: f.fertirriegoActivo.productos.map((p) => ({ productoId: p.id, cantidadAplicada: p.cantidadPorRiego })),
        };
      } else {
        preguntas.push({ seccionId: f.seccion.id, nombreSeccion: `${f.seccion.nombre} (${f.huertaNombre})`, fertirriego: f.fertirriegoActivo });
      }
    }

    if (preguntas.length === 0) {
      await enviarTodo(directas);
      return;
    }
    setRespuestas(directas);
    setCola(preguntas);
    setIndice(0);
    prepararPregunta(preguntas[0]!);
  }

  // Arranca con lo ya guardado hoy o, si no hay registro, con lo programado (solo se corrige lo que cambió).
  function prepararPregunta(p: PreguntaParcial) {
    const registro = datos.flatMap((h) => h.secciones).find((s) => s.seccion.id === p.seccionId)?.registro;
    const c: Record<string, string> = {};
    for (const prod of p.fertirriego.productos) {
      const guardada = registro?.fertirriegoConfirmado ? registro.productos.find((rp) => rp.productoId === prod.id) : undefined;
      c[prod.id] = String(guardada ? Number(guardada.cantidadAplicada) : prod.cantidadPorRiego);
    }
    setCantidades(c);
    setMotivo(registro?.motivoNoAplicado ?? "");
    setErrorDialogo(null);
  }

  async function responderPregunta() {
    const p = cola[indice];
    if (!p) return;
    const e = ediciones[p.seccionId]!;
    const lista = p.fertirriego.productos.map((prod) => ({ productoId: prod.id, cantidadAplicada: Number(cantidades[prod.id] ?? 0) }));
    if (lista.some((c) => !Number.isFinite(c.cantidadAplicada) || c.cantidadAplicada < 0)) {
      setErrorDialogo("Las cantidades deben ser 0 o mayores.");
      return;
    }
    const nadaSeMetio = lista.every((c) => c.cantidadAplicada === 0);
    if (nadaSeMetio && !motivo.trim()) {
      setErrorDialogo("Si no se metió nada, escribe el motivo.");
      return;
    }
    const cuerpo: CuerpoRiego = {
      horas: Number(e.horas),
      comentario: e.comentario.trim() || undefined,
      fertirriegoConfirmado: !nadaSeMetio,
      cantidadesAplicadas: nadaSeMetio ? undefined : lista,
      motivoNoAplicado: nadaSeMetio ? motivo.trim() : undefined,
    };
    const acumuladas = { ...respuestas, [p.seccionId]: cuerpo };
    if (indice + 1 < cola.length) {
      setRespuestas(acumuladas);
      setIndice(indice + 1);
      prepararPregunta(cola[indice + 1]!);
      return;
    }
    setCola([]);
    setRespuestas({});
    await enviarTodo(acumuladas);
  }

  function cancelarPreguntas() {
    setCola([]);
    setRespuestas({});
    setIndice(0);
  }

  async function enviarTodo(cuerpos: Record<string, CuerpoRiego>) {
    setGuardando(true);
    const fallidas: string[] = [];
    const guardadas: string[] = [];
    for (const [seccionId, cuerpo] of Object.entries(cuerpos)) {
      try {
        await api.post(`/riego/${seccionId}/${fecha}`, cuerpo);
        guardadas.push(seccionId);
      } catch (err) {
        const nombre = filasPlanas.find((f) => f.seccion.id === seccionId)?.seccion.nombre ?? seccionId;
        fallidas.push(`${nombre}: ${err instanceof ApiError ? err.message : "no se pudo guardar"}`);
      }
    }
    setGuardando(false);
    if (fallidas.length === 0) {
      setMensaje(`Se guardó el reporte del día (${guardadas.length} ${guardadas.length === 1 ? "sección" : "secciones"}).`);
      cargar();
      return;
    }
    // Lo que sí se guardó ya no está "sucio"; lo que falló se queda para reintentar.
    setEdiciones((prev) => {
      const copia = { ...prev };
      for (const id of guardadas) if (copia[id]) copia[id] = { ...copia[id]!, sucia: false };
      return copia;
    });
    setError(`Se guardaron ${guardadas.length}; fallaron ${fallidas.length} — ${fallidas.join(" · ")}`);
  }

  const preguntaActual = cola[indice];

  const botonGuardar = (
    <button className="btn-primary" onClick={guardarTodo} disabled={guardando || cuantasSucias === 0}>
      {guardando ? "Guardando…" : `Guardar todo${cuantasSucias > 0 ? ` (${cuantasSucias})` : ""}`}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 18 }}>
        <label className="field" style={{ maxWidth: 200 }}>
          Fecha
          <FechaInput value={fecha} onChange={setFecha} />
        </label>
        {botonGuardar}
      </div>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
      {mensaje && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{mensaje}</div>}

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
                    </tr>
                  </thead>
                  <tbody>
                    {secciones.map(({ seccion, fertirriegoActivo }) => {
                      const fila = ediciones[seccion.id];
                      if (!fila) return null;
                      return (
                        <tr key={seccion.id} style={fila.sucia ? { background: "var(--pink-soft)" } : undefined}>
                          <td>{seccion.nombre}</td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              style={{ width: 90 }}
                              value={fila.horas}
                              onChange={(e) => actualizarFila(seccion.id, { horas: e.target.value })}
                            />
                          </td>
                          <td>
                            {fertirriegoActivo ? (
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                <input
                                  type="checkbox"
                                  checked={fila.inyeccionCompleta}
                                  onChange={(e) => actualizarFila(seccion.id, { inyeccionCompleta: e.target.checked })}
                                />
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
                              onChange={(e) => actualizarFila(seccion.id, { comentario: e.target.value })}
                            />
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
          {datos.length > 0 && <div>{botonGuardar}</div>}
        </div>
      )}

      {preguntaActual && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 12 }}
        >
          <div className="card" style={{ width: 460, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 2 }}>
              Pregunta {indice + 1} de {cola.length} — al terminar se guarda todo el reporte
            </div>
            <h3 style={{ marginBottom: 6 }}>{preguntaActual.nombreSeccion}: ¿qué se metió?</h3>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>
              La inyección no se marcó como completa. Deja lo que sí se metió tal cual y corrige lo que cambió (pon 0 si no se metió).
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {preguntaActual.fertirriego.productos.map((p) => (
                <label key={p.id} className="field">
                  {nombreProducto(p)} — programado {formatearNumero(p.cantidadPorRiego)} {p.unidad}
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={cantidades[p.id] ?? ""}
                    onChange={(e) => setCantidades({ ...cantidades, [p.id]: e.target.value })}
                  />
                </label>
              ))}
              <label className="field">
                Motivo (obligatorio solo si no se metió nada)
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </label>
            </div>
            {errorDialogo && <p style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 8 }}>{errorDialogo}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn-secondary" onClick={cancelarPreguntas}>
                Cancelar todo
              </button>
              <button className="btn-primary" onClick={responderPregunta}>
                {indice + 1 < cola.length ? "Siguiente" : "Guardar todo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
