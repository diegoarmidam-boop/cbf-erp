import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Huerta } from "./types";

export function useHuertas() {
  const [huertas, setHuertas] = useState<Huerta[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    return api
      .get<Huerta[]>("/huertas")
      .then(setHuertas)
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { huertas, cargando, refetch };
}
