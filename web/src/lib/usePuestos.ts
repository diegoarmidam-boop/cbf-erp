import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Puesto } from "./types";

export function usePuestos() {
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    return api
      .get<Puesto[]>("/rh/puestos")
      .then(setPuestos)
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { puestos, cargando, refetch };
}
