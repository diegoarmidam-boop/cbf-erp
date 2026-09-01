import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { RecetaFertirriego } from "./types";

// Recetario de Fertirriego (27-ago-2026): endpoint propio, separado de
// /recetario (que sigue siendo exclusivo de Aplicaciones) — ver
// backend/src/modules/fertilizantes/recetario-fertirriego.ts.
export function useRecetasFertirriego() {
  const [recetas, setRecetas] = useState<RecetaFertirriego[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    return api
      .get<RecetaFertirriego[]>("/fertilizantes/fertirriego/recetario")
      .then(setRecetas)
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { recetas, cargando, refetch };
}
