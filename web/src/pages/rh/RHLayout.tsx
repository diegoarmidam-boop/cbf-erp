import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../lib/auth";

export default function RHLayout() {
  const { usuario, modulosVisibles } = useAuth();
  const verPersonal = modulosVisibles.includes("rh");
  const verDoNotHire = modulosVisibles.includes("do_not_hire");
  const esDirectivo = usuario?.rol === "director_general" || usuario?.rol === "encargado_sistemas";

  const tabs = [
    verPersonal && { to: "personal", label: "Personal" },
    verPersonal && { to: "puestos", label: "Puestos" },
    verDoNotHire && { to: "do-not-hire", label: "Do-not-hire" },
    esDirectivo && { to: "accesos", label: "Accesos y usuarios" },
  ].filter(Boolean) as { to: string; label: string }[];

  if (tabs.length === 0) return <p>Tu rol no tiene acceso a ninguna vista de este módulo.</p>;

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Recursos Humanos</h2>
      <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 2 }}>
        {tabs.map((t) => (
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
      {!verPersonal && !verDoNotHire && !esDirectivo && <Navigate to="/nomina" replace />}
    </div>
  );
}
