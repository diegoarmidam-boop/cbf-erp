import { prisma } from "../../core/db.js";

/**
 * Producto preferido y sustitutos autorizados por Ingrediente Activo
 * (9.15, 20-ago-2026): homologa qué marca se compra — a nivel empresa, no
 * por Huerta. No cambia el FIFO de consumo de Almacén (ese sigue siendo por
 * antigüedad dentro del mismo Ingrediente Activo, sin importar si el
 * producto retirado es el preferido o un sustituto) — esto solo dice qué
 * comprar cuando el preferido no está disponible con el proveedor. Flujo en
 * Compras es manual: no hay integración de disponibilidad con proveedor.
 */

class ProductoIngredienteActivoInvalidoError extends Error {}

async function validarMismoIngredienteActivo(ingredienteActivoId: string, productoId: string) {
  const [ingrediente, producto] = await Promise.all([
    prisma.ingredienteActivo.findUniqueOrThrow({ where: { id: ingredienteActivoId } }),
    prisma.producto.findUniqueOrThrow({ where: { id: productoId } }),
  ]);
  if (producto.ingredienteActivo !== ingrediente.nombre) {
    throw new ProductoIngredienteActivoInvalidoError(
      `${producto.nombreComercial} no está registrado con el Ingrediente Activo "${ingrediente.nombre}" — solo se puede elegir como preferido/sustituto un producto con el mismo Ingrediente Activo.`
    );
  }
}

export async function obtenerPreferencia(ingredienteActivoId: string) {
  const ingrediente = await prisma.ingredienteActivo.findUniqueOrThrow({
    where: { id: ingredienteActivoId },
    include: {
      productoPreferido: true,
      sustitutos: { include: { producto: true }, orderBy: { orden: "asc" } },
    },
  });
  return {
    ingredienteActivoId: ingrediente.id,
    ingredienteActivoNombre: ingrediente.nombre,
    productoPreferido: ingrediente.productoPreferido,
    sustitutos: ingrediente.sustitutos,
  };
}

export async function establecerPreferido(ingredienteActivoId: string, productoId: string | null) {
  if (productoId) await validarMismoIngredienteActivo(ingredienteActivoId, productoId);
  await prisma.ingredienteActivo.update({
    where: { id: ingredienteActivoId },
    data: { productoPreferidoId: productoId },
  });
  return obtenerPreferencia(ingredienteActivoId);
}

class SustitutoDuplicadoError extends Error {}
class SustitutoEsElPreferidoError extends Error {}

export async function agregarSustituto(ingredienteActivoId: string, productoId: string) {
  await validarMismoIngredienteActivo(ingredienteActivoId, productoId);

  const ingrediente = await prisma.ingredienteActivo.findUniqueOrThrow({ where: { id: ingredienteActivoId } });
  if (ingrediente.productoPreferidoId === productoId) {
    throw new SustitutoEsElPreferidoError("Este producto ya es el preferido — no hace falta agregarlo también como sustituto.");
  }

  const existente = await prisma.ingredienteActivoSustituto.findUnique({
    where: { ingredienteActivoId_productoId: { ingredienteActivoId, productoId } },
  });
  if (existente) throw new SustitutoDuplicadoError("Este producto ya está en la lista de sustitutos.");

  const maximo = await prisma.ingredienteActivoSustituto.aggregate({
    where: { ingredienteActivoId },
    _max: { orden: true },
  });
  await prisma.ingredienteActivoSustituto.create({
    data: { ingredienteActivoId, productoId, orden: (maximo._max.orden ?? 0) + 1 },
  });
  return obtenerPreferencia(ingredienteActivoId);
}

export async function quitarSustituto(ingredienteActivoId: string, sustitutoId: string) {
  await prisma.ingredienteActivoSustituto.delete({ where: { id: sustitutoId } });
  return obtenerPreferencia(ingredienteActivoId);
}

export async function reordenarSustitutos(ingredienteActivoId: string, ordenDeIds: string[]) {
  await prisma.$transaction(
    ordenDeIds.map((id, indice) =>
      prisma.ingredienteActivoSustituto.update({
        where: { id, ingredienteActivoId },
        data: { orden: indice + 1 },
      })
    )
  );
  return obtenerPreferencia(ingredienteActivoId);
}

export { ProductoIngredienteActivoInvalidoError, SustitutoDuplicadoError, SustitutoEsElPreferidoError };
