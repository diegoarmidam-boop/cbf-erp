import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { CatalogoAbiertoItem } from "./types";

/** Hook genérico para los catálogos abiertos "+" (Categoría, Ingrediente Activo, Contenedor, etc.). */
export function useCatalogoAbierto(endpoint: string) {
  const [items, setItems] = useState<CatalogoAbiertoItem[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    return api
      .get<CatalogoAbiertoItem[]>(endpoint)
      .then(setItems)
      .finally(() => setCargando(false));
  }, [endpoint]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function agregar(nombre: string) {
    const nuevo = await api.post<CatalogoAbiertoItem>(endpoint, { nombre });
    await refetch();
    return nuevo;
  }

  return { items, cargando, refetch, agregar };
}
