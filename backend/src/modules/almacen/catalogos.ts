import { prisma } from "../../core/db.js";

/**
 * Los 3 catálogos abiertos de Producto (Categoría, Ingrediente Activo,
 * Contenedor) comparten la misma forma { id, nombre, activo } — un solo
 * conjunto de funciones parametrizado por el delegate de Prisma evita
 * repetir la misma lógica 3 veces.
 */
type CatalogoDelegate = typeof prisma.categoriaProducto | typeof prisma.ingredienteActivo | typeof prisma.contenedor;

function listar(delegate: CatalogoDelegate, todas: boolean) {
  return (delegate as any).findMany({ where: todas ? undefined : { activo: true }, orderBy: { nombre: "asc" } });
}

function crear(delegate: CatalogoDelegate, nombre: string) {
  return (delegate as any).create({ data: { nombre } });
}

function actualizarActivo(delegate: CatalogoDelegate, id: string, activo: boolean) {
  return (delegate as any).update({ where: { id }, data: { activo } });
}

export const categorias = {
  listar: (todas = false) => listar(prisma.categoriaProducto, todas),
  crear: (nombre: string) => crear(prisma.categoriaProducto, nombre),
  actualizarActivo: (id: string, activo: boolean) => actualizarActivo(prisma.categoriaProducto, id, activo),
};

export const ingredientesActivos = {
  listar: (todas = false) => listar(prisma.ingredienteActivo, todas),
  crear: (nombre: string) => crear(prisma.ingredienteActivo, nombre),
  actualizarActivo: (id: string, activo: boolean) => actualizarActivo(prisma.ingredienteActivo, id, activo),
};

export const contenedores = {
  listar: (todas = false) => listar(prisma.contenedor, todas),
  crear: (nombre: string) => crear(prisma.contenedor, nombre),
  actualizarActivo: (id: string, activo: boolean) => actualizarActivo(prisma.contenedor, id, activo),
};
