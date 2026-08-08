import { useEffect, useState } from "react";
import { api } from "./api";
import type { Personal } from "./types";

export function usePersonal() {
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .get<Personal[]>("/personal")
      .then(setPersonal)
      .finally(() => setCargando(false));
  }, []);

  return { personal, cargando };
}
