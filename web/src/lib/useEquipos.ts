import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Equipo, TipoEquipo } from "./types";

export function useEquipos(tipo?: TipoEquipo) {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    return api
      .get<Equipo[]>(`/equipos${tipo ? `?tipo=${tipo}` : ""}`)
      .then(setEquipos)
      .finally(() => setCargando(false));
  }, [tipo]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { equipos, cargando, refetch };
}
