import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Personal } from "./types";

// `soloDisponibles` (9.11, 15-ago-2026): excluye personal ya liquidado
// fuera de ciclo (Personal.noDisponibleDesde) de las pantallas donde se
// captura trabajo nuevo — sigue existiendo en el catálogo, solo no se
// ofrece para elegir. Úsalo en Captura del día; el resto de selectores
// (RH, historial, etc.) debe seguir viendo a todos.
export function usePersonal(soloDisponibles = false) {
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    return api
      .get<Personal[]>(`/personal${soloDisponibles ? "?soloDisponibles=true" : ""}`)
      .then(setPersonal)
      .finally(() => setCargando(false));
  }, [soloDisponibles]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { personal, cargando, refetch };
}
