import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { BonoConfig, BonoOtorgado, TipoBono } from "../../lib/types";

export default function Bonos() {
  const [bonos, setBonos] = useState<BonoConfig[]>([]);
  const [pendientes, setPendientes] = useState<BonoOtorgado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoBono>("asistencia_perfecta");
  const [monto, setMonto] = useState("");
  const [diasRequeridos, setDiasRequeridos] = useState("6");
  const [mesesRequeridos, setMesesRequeridos] = useState("3");
  const [multiplicador, setMultiplicador] = useState("2");
  const [fechasDobles, setFechasDobles] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  function cargar() {
    api.get<BonoConfig[]>("/nomina/bonos").then(setBonos);
    api.get<BonoOtorgado[]>("/nomina/bonos/pendientes").then(setPendientes);
  }

  useEffect(cargar, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const base = { nombre, tipo } as Record<string, unknown>;
      if (tipo === "asistencia_perfecta") Object.assign(base, { diasRequeridos: Number(diasRequeridos), monto: Number(monto) });
      if (tipo === "permanencia_racha") Object.assign(base, { mesesRequeridos: Number(mesesRequeridos), monto: Number(monto) });
      if (tipo === "dia_doble")
        Object.assign(base, {
          multiplicador: Number(multiplicador),
          fechas: fechasDobles.split(",").map((f) => f.trim()).filter(Boolean),
        });
      if (editandoId) {
        await api.patch(`/nomina/bonos/${editandoId}`, base);
      } else {
        await api.post("/nomina/bonos", base);
      }
      setNombre("");
      setEditandoId(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el bono.");
    }
  }

  function iniciarEdicion(b: BonoConfig) {
    setEditandoId(b.id);
    setNombre(b.nombre);
    setTipo(b.tipo);
    const p = b.parametros as Record<string, unknown>;
    if (b.tipo === "asistencia_perfecta") {
      setDiasRequeridos(String(p.diasRequeridos ?? "6"));
      setMonto(String(p.monto ?? ""));
    } else if (b.tipo === "permanencia_racha") {
      setMesesRequeridos(String(p.mesesRequeridos ?? "3"));
      setMonto(String(p.monto ?? ""));
    } else if (b.tipo === "dia_doble") {
      setMultiplicador(String(p.multiplicador ?? "2"));
      setFechasDobles(b.diasEspeciales.map((d) => d.fecha.slice(0, 10)).join(", "));
    }
    setError(null);
  }

  async function toggleActivo(b: BonoConfig) {
    setError(null);
    try {
      await api.patch(`/nomina/bonos/${b.id}/activo`, { activo: !b.activo });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar.");
    }
  }

  async function generarPendientes() {
    setError(null);
    setMensaje(null);
    try {
      const r = await api.post<{ generados: number }>("/nomina/bonos/generar-pendientes");
      setMensaje(`${r.generados} bono(s) nuevo(s) generado(s) como pendiente de autorizar.`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar.");
    }
  }

  async function resolver(id: string, decision: "autorizar" | "rechazar") {
    setError(null);
    try {
      await api.post(`/nomina/bonos/pendientes/${id}/${decision}`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo resolver.");
    }
  }

  return (
    <div>
      <h3 style={{ marginBottom: 10 }}>Catálogo de bonos</h3>
      <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
        <label className="field">
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label className="field">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoBono)}>
            <option value="asistencia_perfecta">Asistencia perfecta semanal</option>
            <option value="permanencia_racha">Permanencia por racha</option>
            <option value="dia_doble">Día doble</option>
          </select>
        </label>

        {tipo === "asistencia_perfecta" && (
          <>
            <label className="field">
              Días requeridos
              <input type="number" value={diasRequeridos} onChange={(e) => setDiasRequeridos(e.target.value)} />
            </label>
            <label className="field">
              Monto
              <input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required />
            </label>
          </>
        )}
        {tipo === "permanencia_racha" && (
          <>
            <label className="field">
              Meses requeridos
              <input type="number" value={mesesRequeridos} onChange={(e) => setMesesRequeridos(e.target.value)} />
            </label>
            <label className="field">
              Monto
              <input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required />
            </label>
          </>
        )}
        {tipo === "dia_doble" && (
          <>
            <label className="field">
              Multiplicador
              <input type="number" step="0.1" value={multiplicador} onChange={(e) => setMultiplicador(e.target.value)} />
            </label>
            <label className="field">
              Fechas (separadas por coma)
              <input value={fechasDobles} onChange={(e) => setFechasDobles(e.target.value)} placeholder="2026-08-16, 2026-09-16" required />
            </label>
          </>
        )}

        <button className="btn-primary" type="submit">
          {editandoId ? "Guardar cambios" : "+ Nuevo bono"}
        </button>
        {editandoId && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setEditandoId(null);
              setNombre("");
              setMonto("");
              setFechasDobles("");
            }}
          >
            Cancelar
          </button>
        )}
      </form>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
      {mensaje && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{mensaje}</div>}

      <table style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bonos.map((b) => (
            <tr key={b.id}>
              <td>{b.nombre}</td>
              <td>{b.tipo}</td>
              <td>
                <span className={`tag ${b.activo ? "tag-success" : "tag-danger"}`}>{b.activo ? "Activo" : "Inactivo"}</span>
              </td>
              <td style={{ display: "flex", gap: 6 }}>
                <button className="btn-secondary" onClick={() => iniciarEdicion(b)}>
                  Editar
                </button>
                <button className="btn-secondary" onClick={() => toggleActivo(b)}>
                  {b.activo ? "Desactivar" : "Reactivar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3>Pendientes de autorizar</h3>
        <button className="btn-secondary" onClick={generarPendientes}>
          Generar bonos del periodo actual
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Persona</th>
            <th>Bono</th>
            <th>Monto</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pendientes.map((p) => (
            <tr key={p.id}>
              <td>{p.personal?.nombreCompleto}</td>
              <td>{p.bonoConfig?.nombre}</td>
              <td>${Number(p.montoCalculado).toFixed(2)}</td>
              <td style={{ display: "flex", gap: 6 }}>
                <button className="btn-primary" onClick={() => resolver(p.id, "autorizar")}>
                  Autorizar
                </button>
                <button className="btn-secondary" onClick={() => resolver(p.id, "rechazar")}>
                  Rechazar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
