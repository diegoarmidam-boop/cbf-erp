import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { CategoriaProducto } from "./types";

/**
 * Categoría de Producto (Prioridad 3, 4-sep-2026) — ya no usa
 * useCatalogoAbierto porque decide al darse de alta si el campo
 * Ingrediente Activo debe aparecer al capturar un Producto de ese tipo
 * (`requiereIngredienteActivo`), y necesita poder ajustarlo después en una
 * Categoría ya existente.
 */
export function useCategorias(todas = false) {
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([]);
  const [cargando, setCargando] = useState(true);

  const refetch = useCallback(() => {
    setCargando(true);
    return api
      .get<CategoriaProducto[]>(`/almacen/categorias${todas ? "?todas=true" : ""}`)
      .then(setCategorias)
      .finally(() => setCargando(false));
  }, [todas]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function crear(nombre: string, requiereIngredienteActivo: boolean) {
    const nueva = await api.post<CategoriaProducto>("/almacen/categorias", { nombre, requiereIngredienteActivo });
    await refetch();
    return nueva;
  }

  async function actualizarActivo(id: string, activo: boolean) {
    await api.patch(`/almacen/categorias/${id}/activo`, { activo });
    await refetch();
  }

  async function actualizarRequiereIngredienteActivo(id: string, requiereIngredienteActivo: boolean) {
    await api.patch(`/almacen/categorias/${id}/requiere-ingrediente-activo`, { requiereIngredienteActivo });
    await refetch();
  }

  return { categorias, cargando, refetch, crear, actualizarActivo, actualizarRequiereIngredienteActivo };
}
