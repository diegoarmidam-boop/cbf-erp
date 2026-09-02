import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

interface ModuloConfigItem {
  modulo: string;
  etiqueta: string;
  comunicacionActiva: boolean;
}

interface EmpresaConfig {
  id: string;
  razonSocial: string | null;
  rfc: string | null;
  domicilioFiscal: string | null;
  telefono: string | null;
  firmaAtiendeNombre: string | null;
  firmaAutorizaNombre: string | null;
}

/**
 * Configuración del sistema (bloque de arquitectura, 20-ago-2026): switch
 * ON/OFF por módulo para cuando alguien está modificando código de un
 * módulo y necesita que los demás sigan operando sin sus cascadas
 * automáticas. Solo Dirección General/Encargado de Sistemas la ven en el
 * menú (ver AppShell.tsx) — el candado real vive en el backend
 * (configuracion.routes.ts), esto solo evita que aparezca la opción.
 */
export default function ConfiguracionSistema() {
  const [modulos, setModulos] = useState<ModuloConfigItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);

  // Datos de facturación y firmas (2-sep-2026, 9.14) — usados por la Orden
  // de Compra en PDF y cualquier documento futuro que los necesite.
  const [empresaForm, setEmpresaForm] = useState({
    razonSocial: "",
    rfc: "",
    domicilioFiscal: "",
    telefono: "",
    firmaAtiendeNombre: "",
    firmaAutorizaNombre: "",
  });
  const [guardandoEmpresa, setGuardandoEmpresa] = useState(false);
  const [empresaGuardada, setEmpresaGuardada] = useState(false);

  function cargar() {
    setCargando(true);
    api
      .get<ModuloConfigItem[]>("/configuracion/modulos")
      .then(setModulos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  useEffect(() => {
    api.get<EmpresaConfig>("/configuracion/empresa").then((e) => {
      setEmpresaForm({
        razonSocial: e.razonSocial ?? "",
        rfc: e.rfc ?? "",
        domicilioFiscal: e.domicilioFiscal ?? "",
        telefono: e.telefono ?? "",
        firmaAtiendeNombre: e.firmaAtiendeNombre ?? "",
        firmaAutorizaNombre: e.firmaAutorizaNombre ?? "",
      });
    });
  }, []);

  async function guardarEmpresa() {
    setError(null);
    setGuardandoEmpresa(true);
    setEmpresaGuardada(false);
    try {
      await api.patch<EmpresaConfig>("/configuracion/empresa", empresaForm);
      setEmpresaGuardada(true);
      setTimeout(() => setEmpresaGuardada(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setGuardandoEmpresa(false);
    }
  }

  async function alternar(m: ModuloConfigItem) {
    setError(null);
    setCambiando(m.modulo);
    try {
      await api.patch(`/configuracion/modulos/${m.modulo}`, { comunicacionActiva: !m.comunicacionActiva });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar.");
    } finally {
      setCambiando(null);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 6 }}>Configuración del sistema</h2>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 18, maxWidth: 640 }}>
        Herramienta de desarrollo: apagar un módulo detiene únicamente las cascadas automáticas que salen de él hacia los demás (mano
        de obra a Nómina, salida de Almacén, uso diario de Equipos, auto-orden a Compras, etc.) — el módulo sigue funcionando, y lo que
        antes llegaba automático se vuelve capturable a mano en el módulo destino, con la misma estructura de siempre. No apaga nada
        para los usuarios más allá de eso, y queda registrado quién y cuándo lo cambió.
      </p>

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
          {modulos.map((m) => (
            <div
              key={m.modulo}
              className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{m.etiqueta}</div>
              <button
                className={m.comunicacionActiva ? "btn-secondary" : "btn-primary"}
                disabled={cambiando === m.modulo}
                onClick={() => alternar(m)}
                style={{ minWidth: 110 }}
              >
                {cambiando === m.modulo ? "…" : m.comunicacionActiva ? "Encendido" : "Apagado"}
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ margin: "32px 0 6px" }}>Datos de facturación y firmas</h2>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 18, maxWidth: 640 }}>
        Se usan en la Orden de Compra en PDF y en cualquier otro documento que en el futuro los necesite — se capturan una sola vez
        aquí, no en cada documento.
      </p>

      <div className="card" style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="field">
          Razón social
          <input value={empresaForm.razonSocial} onChange={(e) => setEmpresaForm((p) => ({ ...p, razonSocial: e.target.value }))} />
        </label>
        <label className="field">
          RFC
          <input value={empresaForm.rfc} onChange={(e) => setEmpresaForm((p) => ({ ...p, rfc: e.target.value }))} />
        </label>
        <label className="field">
          Domicilio fiscal
          <input
            value={empresaForm.domicilioFiscal}
            onChange={(e) => setEmpresaForm((p) => ({ ...p, domicilioFiscal: e.target.value }))}
          />
        </label>
        <label className="field">
          Teléfono
          <input value={empresaForm.telefono} onChange={(e) => setEmpresaForm((p) => ({ ...p, telefono: e.target.value }))} />
        </label>
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "4px 0" }} />
        <label className="field">
          Firma "Atentamente" (quién atiende/genera la Orden de Compra)
          <input
            value={empresaForm.firmaAtiendeNombre}
            onChange={(e) => setEmpresaForm((p) => ({ ...p, firmaAtiendeNombre: e.target.value }))}
          />
        </label>
        <label className="field">
          Firma "Autorizó"
          <input
            value={empresaForm.firmaAutorizaNombre}
            onChange={(e) => setEmpresaForm((p) => ({ ...p, firmaAutorizaNombre: e.target.value }))}
          />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn-primary" disabled={guardandoEmpresa} onClick={guardarEmpresa}>
            {guardandoEmpresa ? "Guardando…" : "Guardar"}
          </button>
          {empresaGuardada && <span className="tag tag-success">Guardado</span>}
        </div>
      </div>
    </div>
  );
}
