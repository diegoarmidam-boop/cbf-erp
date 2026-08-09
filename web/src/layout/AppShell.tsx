import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { MODULOS_CONSTRUIDOS, moduloVisible } from "../lib/modulos";
import { api } from "../lib/api";
import type { SolicitudPendiente } from "../lib/types";

export default function AppShell() {
  const { usuario, modulosVisibles, logout } = useAuth();
  const modulos = MODULOS_CONSTRUIDOS.filter((m) => moduloVisible(m, modulosVisibles));
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    api
      .get<SolicitudPendiente[]>("/solicitudes")
      .then((r) => setPendientes(r.length))
      .catch(() => setPendientes(0));
  }, []);

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
          <NavLink
            to="/solicitudes"
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
              color: isActive ? "var(--pink)" : "var(--ink)",
              background: isActive ? "var(--pink-soft)" : "transparent",
            })}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: "var(--pink-soft)",
                  color: "var(--pink)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                }}
              >
                🔔
              </span>
              Solicitudes
            </span>
            {pendientes > 0 && (
              <span
                style={{
                  background: "var(--pink)",
                  color: "#fff",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 7px",
                }}
              >
                {pendientes}
              </span>
            )}
          </NavLink>

          <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />

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
