import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { MODULOS_CONSTRUIDOS } from "../lib/modulos";

export default function AppShell() {
  const { usuario, modulosVisibles, logout } = useAuth();
  const modulos = MODULOS_CONSTRUIDOS.filter((m) => modulosVisibles.includes(m.slug));

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside
        style={{
          width: 212,
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: 16,
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--wine)" }}>CHULA</div>
          <div style={{ fontSize: 10, color: "var(--ink-soft)", letterSpacing: "0.08em" }}>BRAND — ERP</div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {modulos.map((m) => (
            <NavLink
              key={m.slug}
              to={`/${m.slug}`}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: "var(--radius-sm)",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
                color: isActive ? "var(--pink)" : "var(--ink)",
                background: isActive ? "var(--pink-soft)" : "transparent",
              })}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: `var(${m.bgVar})`,
                  color: `var(${m.fgVar})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                }}
              >
                {m.icono}
              </span>
              {m.nombre}
            </NavLink>
          ))}
        </nav>

        <div style={{ marginTop: "auto", fontSize: 12, color: "var(--ink-soft)" }}>
          <div style={{ fontWeight: 600, color: "var(--ink)" }}>{usuario?.nombre}</div>
          <div>{usuario?.rol}</div>
          <button className="btn-secondary" style={{ marginTop: 8, width: "100%" }} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
