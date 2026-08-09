import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Producto } from "./types";

export function useProductos(soloAutorizados = false) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    return api
      .get<Producto[]>(`/almacen/productos${soloAutorizados ? "?autorizados=true" : ""}`)
      .then(setProductos)
      .finally(() => setCargando(false));
  }, [soloAutorizados]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { productos, cargando, refetch };
}
