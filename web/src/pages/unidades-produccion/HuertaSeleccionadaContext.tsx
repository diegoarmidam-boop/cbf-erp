import { createContext, useContext } from "react";

interface HuertaSeleccionadaState {
  huertaId: string;
  setHuertaId: (id: string) => void;
}

export const HuertaSeleccionadaContext = createContext<HuertaSeleccionadaState | null>(null);

export function useHuertaSeleccionada(): HuertaSeleccionadaState {
  const ctx = useContext(HuertaSeleccionadaContext);
  if (!ctx) throw new Error("useHuertaSeleccionada debe usarse dentro de UPLayout.");
  return ctx;
}
