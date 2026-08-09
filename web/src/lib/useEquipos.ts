import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Equipo, TipoEquipo } from "./types";

export function useEquipos(tipo?: TipoEquipo, todas = false) {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    const params = new URLSearchParams();
    if (tipo) params.set("tipo", tipo);
    if (todas) params.set("todas", "true");
    const qs = params.toString();
    return api
      .get<Equipo[]>(`/equipos${qs ? `?${qs}` : ""}`)
      .then(setEquipos)
      .finally(() => setCargando(false));
  }, [tipo, todas]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { equipos, cargando, refetch };
}
