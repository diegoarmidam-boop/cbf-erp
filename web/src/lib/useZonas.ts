import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { ZonaFlete } from "./types";

// Catálogo de Zonas y flete (9.14, 29-ago-2026) — usado por el Comparador
// de Cotizaciones y, desde el 3-sep-2026 (Prioridad 2), también por el
// alta/edición de Proveedores (Zona de envío habitual). No usa
// useCatalogoAbierto porque Zona tiene campos propios (costoFleteKg,
// esZonaComprador) más allá de {nombre}. `todas=true` incluye las Zonas
// inactivas (lista administrable en Proveedores → ZonasPanel); los
// selectores (Comparador, alta de Proveedor) siguen usando el default
// (solo activas).
export function useZonas(todas = false) {
  const [zonas, setZonas] = useState<ZonaFlete[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    return api
      .get<ZonaFlete[]>(`/compras/zonas${todas ? "?todas=true" : ""}`)
      .then(setZonas)
      .finally(() => setCargando(false));
  }, [todas]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function crear(nombre: string, costoFleteKg: number, esZonaComprador?: boolean) {
    const nueva = await api.post<ZonaFlete>("/compras/zonas", { nombre, costoFleteKg, esZonaComprador });
    await refetch();
    return nueva;
  }

  async function editar(id: string, cambios: Partial<{ nombre: string; costoFleteKg: number; esZonaComprador: boolean }>) {
    const actualizada = await api.patch<ZonaFlete>(`/compras/zonas/${id}`, cambios);
    await refetch();
    return actualizada;
  }

  async function actualizarActivo(id: string, activo: boolean) {
    await api.patch(`/compras/zonas/${id}/activo`, { activo });
    await refetch();
  }

  return { zonas, cargando, refetch, crear, editar, actualizarActivo };
}
