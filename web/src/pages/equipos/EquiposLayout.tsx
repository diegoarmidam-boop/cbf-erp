import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useEquipos } from "../../lib/useEquipos";
import { EquipoSeleccionadoContext } from "./EquipoSeleccionadoContext";

const TABS = [
  { to: "catalogo", label: "Catálogo" },
  { to: "combustible", label: "Combustible" },
  { to: "mantenimiento", label: "Mantenimiento" },
  { to: "uso-diario", label: "Uso diario" },
];

export default function EquiposLayout() {
  const { equipos, cargando, refetch } = useEquipos();
  const [equipoId, setEquipoId] = useState("");

  useEffect(() => {
    if (!equipoId && equipos.length > 0) setEquipoId(equipos[0]!.id);
  }, [equipos, equipoId]);

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Equipos y Maquinaria</h2>

      {!cargando && equipos.length > 0 && (
        <label className="field" style={{ marginBottom: 16, maxWidth: 320 }}>
          Equipo
          <select value={equipoId} onChange={(e) => setEquipoId(e.target.value)}>
            {equipos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.folio} — {e.tipo} {e.marca ?? ""} {e.modelo ?? ""}
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

      <EquipoSeleccionadoContext.Provider value={{ equipoId, setEquipoId }}>
        <Outlet context={{ refetchEquipos: refetch }} />
      </EquipoSeleccionadoContext.Provider>
    </div>
  );
}
