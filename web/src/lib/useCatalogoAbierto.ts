import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { CatalogoAbiertoItem } from "./types";

/**
 * Hook genérico para los catálogos abiertos "+" (Tipo de aplicación,
 * Ingrediente Activo, Contenedor, Marca, Centros de Costo). `todas=true`
 * incluye los inactivos — usado por Configuración → Catálogos (Prioridad
 * 6, 4-sep-2026), que también puede editar el nombre o desactivar/
 * reactivar un valor ya existente (exclusivo de Director General/
 * Encargado de Sistemas en el backend).
 */
export function useCatalogoAbierto(endpoint: string, todas = false) {
  const [items, setItems] = useState<CatalogoAbiertoItem[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    return api
      .get<CatalogoAbiertoItem[]>(`${endpoint}${todas ? "?todas=true" : ""}`)
      .then(setItems)
      .finally(() => setCargando(false));
  }, [endpoint, todas]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function agregar(nombre: string) {
    const nuevo = await api.post<CatalogoAbiertoItem>(endpoint, { nombre });
    await refetch();
    return nuevo;
  }

  async function editar(id: string, nombre: string) {
    const actualizado = await api.patch<CatalogoAbiertoItem>(`${endpoint}/${id}`, { nombre });
    await refetch();
    return actualizado;
  }

  async function actualizarActivo(id: string, activo: boolean) {
    await api.patch(`${endpoint}/${id}/activo`, { activo });
    await refetch();
  }

  return { items, cargando, refetch, agregar, editar, actualizarActivo };
}
