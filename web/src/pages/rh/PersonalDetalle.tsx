import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, getToken } from "../../lib/api";
import type { Personal, PersonalDocumento } from "../../lib/types";
import { formatearFecha } from "../../lib/fecha";
import { formatearDinero } from "../../lib/numero";
import ConfirmModal from "../../components/ConfirmModal";

const ETIQUETAS_DOC: Record<PersonalDocumento["tipoDocumento"], string> = {
  identificacion: "Identificación",
  contrato: "Contrato",
  comprobante_domicilio: "Comprobante de domicilio",
  otro: "Otro",
};

export default function PersonalDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [persona, setPersona] = useState<Personal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mostrarBaja, setMostrarBaja] = useState(false);
  const [motivoBaja, setMotivoBaja] = useState("");
  const [tipoDoc, setTipoDoc] = useState<PersonalDocumento["tipoDocumento"]>("identificacion");
  const [origenDoc, setOrigenDoc] = useState<"foto_celular" | "escaneo">("escaneo");
  const [confirmandoDocId, setConfirmandoDocId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function cargar() {
    if (!id) return;
    api
      .get<Personal>(`/personal/${id}`)
      .then(setPersona)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  useEffect(cargar, [id]);

  async function confirmarBaja() {
    if (!id) return;
    setError(null);
    try {
      await api.post(`/personal/${id}/baja`, { motivo: motivoBaja });
      setMostrarBaja(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo dar de baja.");
    }
  }

  async function eliminarDocumento(documentoId: string) {
    if (!id) return;
    setError(null);
    try {
      await api.delete(`/personal/${id}/documentos/${documentoId}`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar.");
    }
  }

  async function subirDocumento() {
    if (!id || !fileRef.current?.files?.[0]) return;
    setError(null);
    const form = new FormData();
    form.append("archivo", fileRef.current.files[0]);
    form.append("tipoDocumento", tipoDoc);
    form.append("origen", origenDoc);
    try {
      const token = getToken();
      const res = await fetch(`${api.apiUrl}/personal/${id}/documentos`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Error al subir." }));
        throw new ApiError(res.status, body.error);
      }
      if (fileRef.current) fileRef.current.value = "";
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo subir el documento.");
    }
  }

  if (error) return <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px" }}>{error}</div>;
  if (!persona) return <p>Cargando…</p>;

  return (
    <div>
      <button className="btn-secondary" onClick={() => navigate("/rh/personal")} style={{ marginBottom: 14 }}>
        ← Volver
      </button>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2>{persona.nombreCompleto}</h2>
            <span className={`tag ${persona.activo === false ? "tag-danger" : "tag-success"}`}>
              {persona.activo === false ? "Baja" : "Activo"}
            </span>{" "}
            <span className="tag tag-neutral">{persona.tipo}</span>
          </div>
          {persona.activo !== false && (
            <button className="btn-danger" onClick={() => setMostrarBaja(true)}>
              Dar de baja
            </button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16, fontSize: 12.5 }}>
          <div>
            <div style={{ color: "var(--ink-soft)" }}>Teléfono</div>
            <div>{persona.telefono ?? "—"}</div>
          </div>
          <div>
            <div style={{ color: "var(--ink-soft)" }}>{persona.tipo === "fijo" ? "Domicilio" : "Residencia"}</div>
            <div>{persona.domicilio ?? "—"}</div>
          </div>
          <div>
            <div style={{ color: "var(--ink-soft)" }}>Contacto de emergencia</div>
            <div>{persona.telefonoEmergencia ?? "—"}</div>
          </div>
          <div>
            <div style={{ color: "var(--ink-soft)" }}>Fecha de ingreso</div>
            <div>{formatearFecha(persona.fechaIngreso)}</div>
          </div>
          {persona.tipo === "fijo" && (
            <>
              <div>
                <div style={{ color: "var(--ink-soft)" }}>Puesto</div>
                <div>{persona.puesto?.nombre ?? "—"}</div>
              </div>
              <div>
                <div style={{ color: "var(--ink-soft)" }}>Sueldo</div>
                <div>{persona.sueldo ? formatearDinero(persona.sueldo) : "—"}</div>
              </div>
              <div>
                <div style={{ color: "var(--ink-soft)" }}>RFC</div>
                <div>{persona.rfc ?? "—"}</div>
              </div>
            </>
          )}
          {persona.activo === false && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ color: "var(--ink-soft)" }}>Motivo de baja</div>
              <div>{persona.motivoBaja}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Documentos digitales</h3>
        <ul style={{ listStyle: "none", padding: 0, marginBottom: 14 }}>
          {(persona.documentos ?? []).map((d) => (
            <li key={d.id} style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
              <a href={`${api.apiUrl}${d.archivoUrl}`} target="_blank" rel="noreferrer">
                {ETIQUETAS_DOC[d.tipoDocumento]} — {d.origen === "foto_celular" ? "foto" : "escaneo"}
              </a>
              <button className="btn-secondary" onClick={() => setConfirmandoDocId(d.id)}>
                Borrar
              </button>
            </li>
          ))}
          {(persona.documentos ?? []).length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin documentos todavía.</p>}
        </ul>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="field">
            Tipo
            <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as PersonalDocumento["tipoDocumento"])}>
              {Object.entries(ETIQUETAS_DOC).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Origen
            <select value={origenDoc} onChange={(e) => setOrigenDoc(e.target.value as "foto_celular" | "escaneo")}>
              <option value="escaneo">Escaneo</option>
              <option value="foto_celular">Foto desde celular</option>
            </select>
          </label>
          <input ref={fileRef} type="file" />
          <button className="btn-primary" onClick={subirDocumento}>
            Subir
          </button>
        </div>
      </div>

      {mostrarBaja && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ width: 360 }}>
            <h3 style={{ marginBottom: 10 }}>Dar de baja a {persona.nombreCompleto}</h3>
            <label className="field">
              Motivo (obligatorio)
              <textarea value={motivoBaja} onChange={(e) => setMotivoBaja(e.target.value)} rows={3} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button className="btn-secondary" onClick={() => setMostrarBaja(false)}>
                Cancelar
              </button>
              <button className="btn-danger" onClick={confirmarBaja} disabled={!motivoBaja.trim()}>
                Confirmar baja
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmandoDocId && (
        <ConfirmModal
          titulo="Borrar documento"
          mensaje="¿Borrar este documento? Esto no se puede deshacer."
          peligroso
          onCancelar={() => setConfirmandoDocId(null)}
          onConfirmar={async () => {
            await eliminarDocumento(confirmandoDocId);
            setConfirmandoDocId(null);
          }}
        />
      )}
    </div>
  );
}
