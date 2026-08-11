import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { usePuestos } from "../../lib/usePuestos";
import { useHuertas } from "../../lib/useHuertas";
import type { Personal as PersonalT } from "../../lib/types";
import FechaInput from "../../components/FechaInput";

export default function Personal() {
  const { puestos } = usePuestos();
  const { huertas } = useHuertas();
  const [personal, setPersonal] = useState<PersonalT[]>([]);
  const [filtro, setFiltro] = useState<"todos" | "fijo" | "destajo">("todos");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [nombreCompleto, setNombreCompleto] = useState("");
  const [tipo, setTipo] = useState<"fijo" | "destajo">("destajo");
  const [telefono, setTelefono] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [telefonoEmergencia, setTelefonoEmergencia] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState("");
  const [puestoId, setPuestoId] = useState("");
  const [sueldo, setSueldo] = useState("");
  const [rfc, setRfc] = useState("");
  const [huertaId, setHuertaId] = useState("");

  function cargar() {
    setCargando(true);
    const query = filtro === "todos" ? "" : `?tipo=${filtro}`;
    api
      .get<PersonalT[]>(`/personal${query}`)
      .then(setPersonal)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [filtro]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/personal", {
        nombreCompleto,
        tipo,
        telefono: telefono || undefined,
        domicilio: domicilio || undefined,
        telefonoEmergencia: telefonoEmergencia || undefined,
        fechaIngreso: fechaIngreso || undefined,
        huertaId: huertaId || undefined,
        puestoId: tipo === "fijo" ? puestoId || undefined : undefined,
        sueldo: tipo === "fijo" && sueldo ? Number(sueldo) : undefined,
        rfc: tipo === "fijo" ? rfc || undefined : undefined,
      });
      setNombreCompleto("");
      setTelefono("");
      setDomicilio("");
      setTelefonoEmergencia("");
      setFechaIngreso("");
      setPuestoId("");
      setSueldo("");
      setRfc("");
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["todos", "fijo", "destajo"] as const).map((f) => (
            <button
              key={f}
              className={filtro === f ? "btn-primary" : "btn-secondary"}
              onClick={() => setFiltro(f)}
              style={{ textTransform: "capitalize" }}
            >
              {f}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Agregar persona"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
          <label className="field">
            Nombre completo
            <input value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} required />
          </label>
          <label className="field">
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as "fijo" | "destajo")}>
              <option value="destajo">Destajo / eventual</option>
              <option value="fijo">Fijo</option>
            </select>
          </label>
          <label className="field">
            Teléfono
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>
          <label className="field">
            {tipo === "fijo" ? "Domicilio" : "Residencia"}
            <input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} />
          </label>
          <label className="field">
            Contacto de emergencia
            <input value={telefonoEmergencia} onChange={(e) => setTelefonoEmergencia(e.target.value)} />
          </label>
          <label className="field">
            Fecha de ingreso
            <FechaInput value={fechaIngreso} onChange={setFechaIngreso} />
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
                  {puestos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.periodicidad})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Sueldo
                <input type="number" step="0.01" value={sueldo} onChange={(e) => setSueldo(e.target.value)} />
              </label>
              <label className="field">
                RFC
                <input value={rfc} onChange={(e) => setRfc(e.target.value)} />
              </label>
            </>
          )}

          <button className="btn-primary" type="submit">
            Guardar
          </button>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Puesto</th>
              <th>Teléfono</th>
            </tr>
          </thead>
          <tbody>
            {personal.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/rh/personal/${p.id}`} style={{ color: "var(--ink)", fontWeight: 600, textDecoration: "none" }}>
                    {p.nombreCompleto}
                  </Link>
                </td>
                <td>{p.tipo}</td>
                <td>{p.puesto?.nombre ?? "—"}</td>
                <td>{p.telefono ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
