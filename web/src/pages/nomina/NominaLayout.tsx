import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { to: "captura", label: "Captura del día" },
  { to: "cierre", label: "Cierre del día" },
  { to: "grupos", label: "Grupos de Pago" },
  { to: "asistencia", label: "Asistencia" },
  { to: "prestamos", label: "Préstamos" },
  { to: "bonos", label: "Bonos" },
  { to: "liquidaciones", label: "Liquidaciones" },
  { to: "reporte", label: "Reporte semanal" },
  { to: "catalogos", label: "Catálogos" },
];

export default function NominaLayout() {
  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Nómina</h2>
      <div
        style={{
          display: "flex",
          gap: 4,
          overflowX: "auto",
          marginBottom: 20,
          borderBottom: "1px solid var(--border)",
          paddingBottom: 2,
        }}
      >
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
      <Outlet />
    </div>
  );
}
