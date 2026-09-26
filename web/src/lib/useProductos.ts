import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Producto } from "./types";

export function useProductos(soloAutorizados = false, categoria?: string) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    const params = new URLSearchParams();
    if (soloAutorizados) params.set("autorizados", "true");
    if (categoria) params.set("categoria", categoria);
    const query = params.toString();
    return api
      .get<Producto[]>(`/almacen/productos${query ? `?${query}` : ""}`)
      .then(setProductos)
      .finally(() => setCargando(false));
  }, [soloAutorizados, categoria]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { productos, cargando, refetch };
}
