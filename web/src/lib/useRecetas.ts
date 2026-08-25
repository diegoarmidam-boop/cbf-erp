import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { ModuloReceta, Receta } from "./types";

export function useRecetas(modulo: ModuloReceta) {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    return api
      .get<Receta[]>(`/recetario?modulo=${modulo}`)
      .then(setRecetas)
      .finally(() => setCargando(false));
  }, [modulo]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { recetas, cargando, refetch };
}
