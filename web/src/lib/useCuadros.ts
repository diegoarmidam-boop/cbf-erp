import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Cuadro } from "./types";

export function useCuadros(huertaId: string) {
  const [cuadros, setCuadros] = useState<Cuadro[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    if (!huertaId) return Promise.resolve();
    setCargando(true);
    return api
      .get<Cuadro[]>(`/cuadros?huertaId=${huertaId}`)
      .then(setCuadros)
      .finally(() => setCargando(false));
  }, [huertaId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { cuadros, cargando, refetch };
}
