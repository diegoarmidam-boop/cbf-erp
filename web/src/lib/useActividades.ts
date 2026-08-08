import { useEffect, useState } from "react";
import { api } from "./api";
import type { Actividad } from "./types";

export function useActividades() {
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .get<Actividad[]>("/nomina/actividades")
      .then(setActividades)
      .finally(() => setCargando(false));
  }, []);

  return { actividades, cargando };
}
