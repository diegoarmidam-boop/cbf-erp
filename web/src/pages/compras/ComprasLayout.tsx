import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { to: "ordenes", label: "Órdenes" },
  { to: "proveedores", label: "Proveedores" },
];

export default function ComprasLayout() {
  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Compras</h2>
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
      <Outlet />
    </div>
  );
}
