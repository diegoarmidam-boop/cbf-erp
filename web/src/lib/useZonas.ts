import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { ZonaFlete } from "./types";

// Catálogo de Zonas y flete (9.14, 29-ago-2026) — exclusivo del Comparador
// de Cotizaciones. No usa useCatalogoAbierto porque Zona tiene campos
// propios (costoFleteKg, esZonaComprador) más allá de {nombre}.
export function useZonas() {
  const [zonas, setZonas] = useState<ZonaFlete[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    return api
      .get<ZonaFlete[]>("/compras/zonas")
      .then(setZonas)
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function crear(nombre: string, costoFleteKg: number, esZonaComprador?: boolean) {
    const nueva = await api.post<ZonaFlete>("/compras/zonas", { nombre, costoFleteKg, esZonaComprador });
    await refetch();
    return nueva;
  }

  return { zonas, cargando, refetch, crear };
}
