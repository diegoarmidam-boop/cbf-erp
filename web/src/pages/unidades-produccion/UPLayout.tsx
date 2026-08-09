import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useHuertas } from "../../lib/useHuertas";
import { HuertaSeleccionadaContext } from "./HuertaSeleccionadaContext";

const TABS = [
  { to: "huertas", label: "Huertas y Cuadros" },
  { to: "ciclos", label: "Ciclos" },
  { to: "riego", label: "Secciones de Riego" },
];

export default function UPLayout() {
  const { huertas, cargando, refetch } = useHuertas();
  const [huertaId, setHuertaId] = useState("");

  useEffect(() => {
    if (!huertaId && huertas.length > 0) setHuertaId(huertas[0]!.id);
  }, [huertas, huertaId]);

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Unidades de Producción</h2>

      {!cargando && huertas.length > 0 && (
        <label className="field" style={{ marginBottom: 16, maxWidth: 280 }}>
          Huerta
          <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)}>
            {huertas.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 2 }}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            style={({ isActive }) => ({
              padding: "8px 14px",
              borderRadius: "999px 999px 0 0",
              textDecoration: "none",
              fontSize: 12.5,
              fontWeight: 600,
              whiteSpace: "nowrap",
              color: isActive ? "var(--pink)" : "var(--ink-soft)",
              background: isActive ? "var(--pink-soft)" : "transparent",
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <HuertaSeleccionadaContext.Provider value={{ huertaId, setHuertaId }}>
        <Outlet context={{ refetchHuertas: refetch }} />
      </HuertaSeleccionadaContext.Provider>
    </div>
  );
}
