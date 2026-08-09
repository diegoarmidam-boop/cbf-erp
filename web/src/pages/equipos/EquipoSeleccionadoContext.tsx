import { createContext, useContext } from "react";

interface EquipoSeleccionadoState {
  equipoId: string;
  setEquipoId: (id: string) => void;
}

export const EquipoSeleccionadoContext = createContext<EquipoSeleccionadoState | null>(null);

export function useEquipoSeleccionado(): EquipoSeleccionadoState {
  const ctx = useContext(EquipoSeleccionadoContext);
  if (!ctx) throw new Error("useEquipoSeleccionado debe usarse dentro de EquiposLayout.");
  return ctx;
}
