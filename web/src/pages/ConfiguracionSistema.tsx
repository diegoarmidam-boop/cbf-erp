import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

interface ModuloConfigItem {
  modulo: string;
  etiqueta: string;
  comunicacionActiva: boolean;
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

  function cargar() {
    setCargando(true);
    api
      .get<ModuloConfigItem[]>("/configuracion/modulos")
      .then(setModulos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

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
    </div>
  );
}
