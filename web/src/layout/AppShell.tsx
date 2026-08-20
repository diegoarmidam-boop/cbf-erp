import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { MODULOS_CONSTRUIDOS, moduloVisible } from "../lib/modulos";
import { api } from "../lib/api";
import { ErrorBoundary } from "../components/ErrorBoundary";
import type { Notificacion } from "../lib/types";

export default function AppShell() {
  const { usuario, modulosVisibles, logout } = useAuth();
  const modulos = MODULOS_CONSTRUIDOS.filter((m) => moduloVisible(m, modulosVisibles));
  const [pendientes, setPendientes] = useState(0);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const location = useLocation();

  useEffect(() => {
    api
      .get<Notificacion[]>("/notificaciones")
      .then((r) => setPendientes(r.length))
      .catch(() => setPendientes(0));
  }, []);

  // Cerrar el cajón al navegar — si no, se quedaría abierto tapando la
  // pantalla después de elegir una sección (bloque 4/5, menú de celular).
  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  return (
    <div className="app-shell" style={{ display: "flex", height: "100vh" }}>
      <div className="app-mobile-topbar">
        <button
          className="btn-secondary"
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
          style={{ padding: "8px 12px" }}
        >
          ☰
        </button>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--wine)" }}>CHULA — BRAND ERP</div>
        <div style={{ width: 40 }} />
      </div>

      <div className={`app-sidebar-backdrop ${menuAbierto ? "abierto" : ""}`} onClick={() => setMenuAbierto(false)} />

      <aside
        className={`app-sidebar ${menuAbierto ? "abierto" : ""}`}
        style={{
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

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
          <NavLink
            to="/notificaciones"
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
              Notificaciones
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

      <main className="app-main" style={{ flex: 1, overflow: "auto", padding: 24, minWidth: 0 }}>
        {/* key=pathname: si esta pantalla truena, navegar a otra (el menú
            sigue visible aquí afuera) debe reintentar de cero en vez de
            seguir mostrando el mensaje de error de la pantalla anterior. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
