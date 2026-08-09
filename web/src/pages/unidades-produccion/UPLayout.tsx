import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../../lib/api";
import { useHuertas } from "../../lib/useHuertas";
import type { Huerta } from "../../lib/types";
import { HuertaSeleccionadaContext } from "./HuertaSeleccionadaContext";

const TABS = [
  { to: "huertas", label: "Huertas y Cuadros" },
  { to: "ciclos", label: "Ciclos" },
  { to: "riego", label: "Secciones de Riego" },
];

export default function UPLayout() {
  const { huertas: huertasActivas, cargando, refetch } = useHuertas();
  const [huertaId, setHuertaId] = useState("");
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [todasLasHuertas, setTodasLasHuertas] = useState<Huerta[]>([]);

  useEffect(() => {
    if (mostrarInactivas) api.get<Huerta[]>("/huertas?todas=true").then(setTodasLasHuertas);
  }, [mostrarInactivas, huertasActivas]);

  const huertas = mostrarInactivas ? todasLasHuertas : huertasActivas;
  const huertaActual = huertas.find((h) => h.id === huertaId) ?? null;

  useEffect(() => {
    if (!huertaId && huertas.length > 0) setHuertaId(huertas[0]!.id);
  }, [huertas, huertaId]);

  function refetchTodo() {
    refetch();
    if (mostrarInactivas) api.get<Huerta[]>("/huertas?todas=true").then(setTodasLasHuertas);
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Unidades de Producción</h2>

      {!cargando && huertas.length > 0 && (
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
          <label className="field" style={{ maxWidth: 280 }}>
            Huerta
            <select value={huertaId} onChange={(e) => setHuertaId(e.target.value)}>
              {huertas.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nombre}
                  {!h.activo ? " (inactiva)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-soft)" }}>
            <input type="checkbox" checked={mostrarInactivas} onChange={(e) => setMostrarInactivas(e.target.checked)} />
            Mostrar Huertas inactivas
          </label>
        </div>
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
        <Outlet context={{ refetchHuertas: refetchTodo, huertaActual }} />
      </HuertaSeleccionadaContext.Provider>
    </div>
  );
}
