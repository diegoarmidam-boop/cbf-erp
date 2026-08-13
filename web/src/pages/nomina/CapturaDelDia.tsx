import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useActividades } from "../../lib/useActividades";
import { usePersonal } from "../../lib/usePersonal";
import type { CapturaHuertaTodasUPs, ChecklistDiaGrupo, GrupoPago, RegistroNomina, TipoAsistenciaGrupoDia } from "../../lib/types";
import FechaInput from "../../components/FechaInput";

const ROLES_EDITAR_NOMINA = ["director_general", "recursos_humanos", "encargado_nominas", "gerente_administrativo"];

const ETIQUETAS_ORIGEN: Record<string, string> = {
  automatico_aplicacion: "Automático — Aplicación",
  automatico_fertilizacion: "Automático — Fertilización",
  automatico_actividad: "Automático — Actividad",
  automatico_cosecha: "Automático — Cosecha",
  automatico_empaque: "Automático — Empaque",
};

function hoyISO(): string {
  const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let contadorKey = 0;
function nuevaKey(): string {
  contadorKey += 1;
  return `nueva-${Date.now()}-${contadorKey}`;
}

interface Linea {
  key: string;
  huertaId: string;
  actividadId: string;
  cuadroId?: string;
  cantidad: number | null;
  automatico: boolean;
  origenLabel?: string;
}

interface Tarjeta {
  key: string; // "p:<personalId>" | "g:<grupoId>"
  tipo: "individual" | "grupal";
  personalId?: string;
  grupoId?: string;
  lineas: Linea[];
}

function construirTarjetas(datos: CapturaHuertaTodasUPs[]): Tarjeta[] {
  const mapa = new Map<string, Tarjeta>();
  for (const h of datos) {
    const fuente: (RegistroNomina | { personalId?: string; grupoId?: string; actividadId: string; cuadroId?: string; cantidad: number | null })[] =
      h.registros.length > 0 ? h.registros : h.sugerencia;
    for (const r of fuente) {
      const esRegistro = "id" in r;
      const key = r.personalId ? `p:${r.personalId}` : `g:${r.grupoId}`;
      if (!mapa.has(key)) {
        mapa.set(key, { key, tipo: r.personalId ? "individual" : "grupal", personalId: r.personalId, grupoId: r.grupoId, lineas: [] });
      }
      mapa.get(key)!.lineas.push({
        key: esRegistro ? (r as RegistroNomina).id : nuevaKey(),
        huertaId: h.huerta.id,
        actividadId: r.actividadId,
        cuadroId: r.cuadroId,
        cantidad: r.cantidad,
        automatico: esRegistro && (r as RegistroNomina).origen !== "manual",
        origenLabel: esRegistro ? ETIQUETAS_ORIGEN[(r as RegistroNomina).origen] : undefined,
      });
    }
  }
  return [...mapa.values()];
}

export default function CapturaDelDia() {
  const { usuario } = useAuth();
  const { actividades } = useActividades();
  const { personal } = usePersonal();
  const puedeEditarCerrado = usuario ? ROLES_EDITAR_NOMINA.includes(usuario.rol) : false;

  const [searchParams] = useSearchParams();
  const [fecha, setFecha] = useState(searchParams.get("fecha") || hoyISO());
  const [datos, setDatos] = useState<CapturaHuertaTodasUPs[]>([]);
  const [grupos, setGrupos] = useState<GrupoPago[]>([]);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [agregarTipo, setAgregarTipo] = useState<"individual" | "grupal">("individual");
  const [agregarId, setAgregarId] = useState("");

  function cargar() {
    if (!fecha) return;
    setCargando(true);
    setError(null);
    setMensaje(null);
    Promise.all([api.get<CapturaHuertaTodasUPs[]>(`/nomina/captura/todas-ups/${fecha}`), api.get<GrupoPago[]>(`/nomina/grupos?fecha=${fecha}`)])
      .then(([d, g]) => {
        setDatos(d);
        setGrupos(g);
        setTarjetas(construirTarjetas(d));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [fecha]);

  const multiRancho = datos.length > 1;
  const huertaUnica = datos[0]?.huerta.id;

  function nombreDeTarjeta(t: Tarjeta): string {
    if (t.tipo === "individual") return personal.find((p) => p.id === t.personalId)?.nombreCompleto ?? "—";
    return grupos.find((g) => g.id === t.grupoId)?.nombre ?? "Grupo sin nombre";
  }

  function huertaCerrada(huertaId: string): boolean {
    return datos.find((d) => d.huerta.id === huertaId)?.cerrado ?? false;
  }

  function lineaEditable(l: Linea): boolean {
    if (l.automatico) return false;
    const cerrada = huertaCerrada(l.huertaId);
    return !cerrada || puedeEditarCerrado;
  }

  function actualizarLinea(tarjetaKey: string, lineaKey: string, cambios: Partial<Linea>) {
    setTarjetas((prev) =>
      prev.map((t) => (t.key !== tarjetaKey ? t : { ...t, lineas: t.lineas.map((l) => (l.key !== lineaKey ? l : { ...l, ...cambios })) }))
    );
  }

  function agregarLinea(tarjetaKey: string) {
    setTarjetas((prev) =>
      prev.map((t) =>
        t.key !== tarjetaKey
          ? t
          : { ...t, lineas: [...t.lineas, { key: nuevaKey(), huertaId: huertaUnica ?? "", actividadId: "", cantidad: null, automatico: false }] }
      )
    );
  }

  function quitarLinea(tarjetaKey: string, lineaKey: string) {
    setTarjetas((prev) => prev.map((t) => (t.key !== tarjetaKey ? t : { ...t, lineas: t.lineas.filter((l) => l.key !== lineaKey) })));
  }

  // Simétrico a "+ Agregar persona": quita la tarjeta completa (todas sus
  // líneas) por si se agregó por error. Solo si TODAS sus líneas manuales
  // son editables — si alguna vive en una Huerta ya cerrada sin permiso, no
  // se permite (se perdería información que el usuario no puede recapturar).
  // Si la tarjeta es 100% automática no hay nada que quitar — ese registro
  // debe seguir visible, no se oculta.
  function tarjetaEsRemovible(t: Tarjeta): boolean {
    const lineasManuales = t.lineas.filter((l) => !l.automatico);
    return lineasManuales.length > 0 && lineasManuales.every((l) => lineaEditable(l));
  }

  function quitarTarjeta(tarjetaKey: string) {
    setTarjetas((prev) => prev.filter((t) => t.key !== tarjetaKey));
  }

  function agregarTarjeta() {
    if (!agregarId) return;
    const key = agregarTipo === "individual" ? `p:${agregarId}` : `g:${agregarId}`;
    if (tarjetas.some((t) => t.key === key)) {
      setAgregarId("");
      return;
    }
    setTarjetas((prev) => [
      ...prev,
      {
        key,
        tipo: agregarTipo,
        personalId: agregarTipo === "individual" ? agregarId : undefined,
        grupoId: agregarTipo === "grupal" ? agregarId : undefined,
        lineas: [{ key: nuevaKey(), huertaId: huertaUnica ?? "", actividadId: "", cantidad: null, automatico: false }],
      },
    ]);
    setAgregarId("");
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    setMensaje(null);

    for (const t of tarjetas) {
      for (const l of t.lineas) {
        if (l.automatico) continue;
        if (!lineaEditable(l)) continue;
        if (!l.huertaId) {
          setError(`Falta el Rancho en una línea de ${nombreDeTarjeta(t)}.`);
          setGuardando(false);
          return;
        }
        if (!l.actividadId || !l.cantidad || l.cantidad <= 0) {
          setError(`Falta completar una línea de ${nombreDeTarjeta(t)}.`);
          setGuardando(false);
          return;
        }
      }
    }

    const porHuerta = new Map<string, { tipo: string; personalId?: string; grupoId?: string; actividadId: string; cuadroId?: string; cantidad: number }[]>();
    for (const t of tarjetas) {
      for (const l of t.lineas) {
        if (l.automatico || !lineaEditable(l)) continue;
        const arr = porHuerta.get(l.huertaId) ?? [];
        arr.push({
          tipo: t.tipo,
          personalId: t.tipo === "individual" ? t.personalId : undefined,
          grupoId: t.tipo === "grupal" ? t.grupoId : undefined,
          actividadId: l.actividadId,
          cuadroId: l.cuadroId,
          cantidad: l.cantidad!,
        });
        porHuerta.set(l.huertaId, arr);
      }
    }

    const huertaIdsAGuardar = datos.filter((d) => !d.cerrado || puedeEditarCerrado).map((d) => d.huerta.id);
    const errores: string[] = [];
    for (const huertaId of huertaIdsAGuardar) {
      try {
        await api.post(`/nomina/captura/${huertaId}/${fecha}`, { filas: porHuerta.get(huertaId) ?? [] });
      } catch (err) {
        const nombreHuerta = datos.find((d) => d.huerta.id === huertaId)?.huerta.nombre ?? huertaId;
        errores.push(`${nombreHuerta}: ${err instanceof ApiError ? err.message : "no se pudo guardar"}`);
      }
    }
    setGuardando(false);
    if (errores.length > 0) setError(errores.join(" · "));
    else setMensaje("Captura guardada.");
    cargar();
  }

  const personalDisponible = personal.filter((p) => !tarjetas.some((t) => t.key === `p:${p.id}`));
  const gruposDisponibles = grupos.filter((g) => !tarjetas.some((t) => t.key === `g:${g.id}`));

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "flex-end" }}>
        <label className="field" style={{ maxWidth: 180 }}>
          Fecha
          <FechaInput value={fecha} onChange={setFecha} />
        </label>
        {multiRancho && <span className="tag tag-neutral">Todas UPs — {datos.length} Ranchos</span>}
      </div>

      {error && (
        <div className="tag tag-danger" style={{ marginBottom: 12, display: "block", padding: "8px 12px" }}>
          {error}
        </div>
      )}
      {mensaje && (
        <div className="tag tag-success" style={{ marginBottom: 12, display: "block", padding: "8px 12px" }}>
          {mensaje}
        </div>
      )}

      {cargando ? (
        <p>Cargando…</p>
      ) : datos.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>No hay Huertas activas dentro de tu alcance.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {datos.map((d) => (
              <div key={d.huerta.id} style={{ fontSize: 11.5, display: "flex", gap: 8, alignItems: "center" }}>
                <strong>{d.huerta.nombre}</strong>
                {d.cerrado ? (
                  <span className="tag tag-neutral">{puedeEditarCerrado ? "Cerrado — puedes corregir" : "Cerrado — no editable"}</span>
                ) : (
                  <span className="tag tag-success">Abierto</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {tarjetas.map((t) => {
              const grupoInfo = t.tipo === "grupal" ? grupos.find((g) => g.id === t.grupoId) : undefined;
              return (
                <div key={t.key} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {nombreDeTarjeta(t)}
                      {t.tipo === "grupal" && <span className="tag tag-neutral" style={{ marginLeft: 8 }}>Grupo</span>}
                    </div>
                    {tarjetaEsRemovible(t) && (
                      <button className="btn-secondary" onClick={() => quitarTarjeta(t.key)}>
                        Quitar {t.tipo === "grupal" ? "grupo" : "persona"}
                      </button>
                    )}
                  </div>

                  <table>
                    <thead>
                      <tr>
                        {multiRancho && <th>Rancho</th>}
                        <th>Actividad</th>
                        <th>Cantidad</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.lineas.map((l) => {
                        const actividad = actividades.find((a) => a.id === l.actividadId);
                        const editable = lineaEditable(l);
                        return (
                          <tr key={l.key}>
                            {multiRancho && (
                              <td>
                                {l.automatico ? (
                                  datos.find((d) => d.huerta.id === l.huertaId)?.huerta.nombre
                                ) : (
                                  <select
                                    value={l.huertaId}
                                    disabled={!editable}
                                    onChange={(e) => actualizarLinea(t.key, l.key, { huertaId: e.target.value })}
                                  >
                                    <option value="">Selecciona…</option>
                                    {datos.map((d) => (
                                      <option key={d.huerta.id} value={d.huerta.id}>
                                        {d.huerta.nombre}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>
                            )}
                            <td>
                              {l.automatico ? (
                                <span>
                                  {actividad?.nombre ?? "—"} <span className="tag tag-neutral">{l.origenLabel}</span>
                                </span>
                              ) : (
                                <>
                                  <select value={l.actividadId} disabled={!editable} onChange={(e) => actualizarLinea(t.key, l.key, { actividadId: e.target.value })}>
                                    <option value="">Selecciona…</option>
                                    {actividades.map((a) => (
                                      <option key={a.id} value={a.id}>
                                        {a.nombre} ({a.unidad})
                                      </option>
                                    ))}
                                  </select>
                                  {actividad?.requiereCuadro && (
                                    <div style={{ fontSize: 10.5, color: "var(--warning)" }}>Requiere Cuadro — módulo aún no construido.</div>
                                  )}
                                </>
                              )}
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                style={{ width: 90 }}
                                value={l.cantidad ?? ""}
                                disabled={l.automatico || !editable}
                                onChange={(e) => actualizarLinea(t.key, l.key, { cantidad: e.target.value === "" ? null : Number(e.target.value) })}
                              />
                            </td>
                            <td>
                              {!l.automatico && editable && t.lineas.length > 1 && (
                                <button className="btn-secondary" onClick={() => quitarLinea(t.key, l.key)}>
                                  Quitar
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {(!huertaCerrada(t.lineas[0]?.huertaId ?? "") || puedeEditarCerrado) && (
                    <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => agregarLinea(t.key)}>
                      + Otra actividad
                    </button>
                  )}

                  {t.tipo === "grupal" && grupoInfo?.persistente && <AsistenciaGrupoDia grupoId={grupoInfo.id} fecha={fecha} />}
                </div>
              );
            })}
          </div>

          <div className="card" style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label className="field">
              Tipo
              <select value={agregarTipo} onChange={(e) => { setAgregarTipo(e.target.value as "individual" | "grupal"); setAgregarId(""); }}>
                <option value="individual">Persona</option>
                <option value="grupal">Grupo</option>
              </select>
            </label>
            <label className="field" style={{ minWidth: 220 }}>
              {agregarTipo === "individual" ? "Persona" : "Grupo"}
              <select value={agregarId} onChange={(e) => setAgregarId(e.target.value)}>
                <option value="">Selecciona…</option>
                {(agregarTipo === "individual" ? personalDisponible : gruposDisponibles).map((x) => (
                  <option key={x.id} value={x.id}>
                    {"nombreCompleto" in x ? x.nombreCompleto : x.nombre ?? "(sin nombre)"}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-secondary" onClick={agregarTarjeta} disabled={!agregarId}>
              + Agregar persona
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            <button className="btn-primary" onClick={guardar} disabled={guardando || tarjetas.length === 0}>
              {guardando ? "Guardando…" : "Guardar captura del día"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AsistenciaGrupoDia({ grupoId, fecha }: { grupoId: string; fecha: string }) {
  const { personal } = usePersonal();
  const [checklist, setChecklist] = useState<ChecklistDiaGrupo | null>(null);
  const [marcas, setMarcas] = useState<Record<string, TipoAsistenciaGrupoDia | undefined>>({});
  const [sustitutoNuevo, setSustitutoNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  function cargar() {
    api.get<ChecklistDiaGrupo>(`/nomina/grupos/${grupoId}/asistencia/${fecha}`).then((r) => {
      setChecklist(r);
      const m: Record<string, TipoAsistenciaGrupoDia | undefined> = {};
      for (const marca of r.marcas) m[marca.personalId] = marca.tipo;
      setMarcas(m);
    });
  }

  useEffect(cargar, [grupoId, fecha]);

  function alternarAusente(personalId: string) {
    setMarcas((prev) => ({ ...prev, [personalId]: prev[personalId] === "ausente" ? undefined : "ausente" }));
  }

  function agregarSustituto() {
    if (!sustitutoNuevo) return;
    setMarcas((prev) => ({ ...prev, [sustitutoNuevo]: "sustituto" }));
    setSustitutoNuevo("");
  }

  function quitarSustituto(personalId: string) {
    setMarcas((prev) => {
      const copia = { ...prev };
      delete copia[personalId];
      return copia;
    });
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const marcasArr = Object.entries(marcas)
        .filter((entrada): entrada is [string, TipoAsistenciaGrupoDia] => !!entrada[1])
        .map(([personalId, tipo]) => ({ personalId, tipo }));
      await api.post(`/nomina/grupos/${grupoId}/asistencia/${fecha}`, { marcas: marcasArr });
      setMensaje("Asistencia del grupo guardada.");
      cargar();
    } catch {
      setMensaje("No se pudo guardar la asistencia.");
    } finally {
      setGuardando(false);
    }
  }

  if (!checklist) return null;
  const sustitutosIds = Object.entries(marcas)
    .filter(([, t]) => t === "sustituto")
    .map(([id]) => id);

  return (
    <div className="card" style={{ marginTop: 10, background: "var(--surface-soft, #fafafa)" }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Asistencia del grupo hoy</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {checklist.roster.map((p) => (
          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={marcas[p.id] !== "ausente"} onChange={() => alternarAusente(p.id)} />
            {p.nombreCompleto} {marcas[p.id] === "ausente" && <span className="tag tag-danger">Faltó</span>}
          </label>
        ))}
        {sustitutosIds.map((id) => {
          const p = personal.find((x) => x.id === id);
          return (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span className="tag tag-success">Sustituto</span> {p?.nombreCompleto ?? id}
              <button onClick={() => quitarSustituto(id)} style={{ border: "none", background: "none", color: "var(--danger)", cursor: "pointer", fontWeight: 700 }}>
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={sustitutoNuevo} onChange={(e) => setSustitutoNuevo(e.target.value)}>
          <option value="">+ Agregar sustituto…</option>
          {personal
            .filter((p) => !checklist.roster.some((r) => r.id === p.id) && !sustitutosIds.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombreCompleto}
              </option>
            ))}
        </select>
        <button className="btn-secondary" onClick={agregarSustituto} disabled={!sustitutoNuevo}>
          Agregar
        </button>
        <button className="btn-primary" onClick={guardar} disabled={guardando}>
          Guardar asistencia
        </button>
      </div>
      {mensaje && (
        <div className="tag tag-success" style={{ marginTop: 6 }}>
          {mensaje}
        </div>
      )}
    </div>
  );
}
