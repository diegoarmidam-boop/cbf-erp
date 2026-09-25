import {
  calcularCantidadTotal,
  calcularMezclaPorTanque,
  calcularRepartoAvance,
  calcularTanquePendiente,
  ordenarPorNombreNumerico,
  proporcionDelGrupo,
  repartirMontoPorHectareas,
  tarifaEfectiva,
  type ConcentracionUnidad,
  type GrupoPrograma,
} from "@cbf/shared";
import type { Prisma, Rol } from "@prisma/client";
import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
import { ingredientesAutorizados, resolverProductoPreferidoPorNombre } from "../almacen/preferencias.js";
import { categoriaRequiereIngredienteActivo, nombresCategoriasConIngredienteActivo } from "../almacen/productos.js";
import { actualizarDosisProductoEnReceta, obtenerReceta, ROLES_RECETAS } from "../recetario/recetario.js";
import {
  ajustarCantidadProducto,
  confirmarEntregaComprometida,
  crearLoteRespaldo,
  desgloseLotesDeMovimientos,
  intentarComprometer,
  liberarComprometido,
  regresarProporcionalALotes,
  stockTotalProductoTx,
} from "../almacen/movimientos.js";
import { listarEquipos } from "../equipos/equipos.js";
import { registrarUsoDiarioAutomaticoTx, borrarUsoDiarioDeLineasTx } from "../equipos/uso-diario.js";
import { obtenerVersionVigente } from "../unidades-produccion/cuadros.js";
import { obtenerConfigNomina } from "../nomina/config.js";
import { aActividadCalc } from "../nomina/util.js";
import { diaEstaCerrado } from "../nomina/captura.js";
import { cancelarOrdenesDeReferencia } from "../compras/ordenes.js";

// La actividad de Nómina a la que se liga la mano de obra automática de una
// Aplicación (9.7/9.11) — "Fumigación" es la actividad confirmada del
// catálogo de las 12 vigentes que corresponde a agroquímicos.
const NOMBRE_ACTIVIDAD_APLICACION = "Fumigación";
const DIAS_VENCIMIENTO = 15;

export class ProductoNoAutorizadoAplicacionError extends Error {
  constructor() {
    super("Uno de los productos elegidos no es un agroquímico autorizado — no se puede programar una aplicación con él.");
  }
}

export class TransicionAplicacionInvalidaError extends Error {
  constructor(esperado: string) {
    super(`Esta aplicación no está en estado "${esperado}".`);
  }
}

export class StockNoComprometidoError extends Error {
  constructor() {
    super("Todavía no hay suficiente stock apartado para todos los productos de esta aplicación — espera a que llegue la compra automática.");
  }
}

export class SuperficieExcedeCuadroReporteError extends Error {
  constructor(nombreCuadro: string, hectareasCuadro: number, hectareasAcumuladas: number) {
    super(
      `El Cuadro "${nombreCuadro}" tiene ${hectareasCuadro} ha, pero entre todos los reportes de esta aplicación se acumularían ${hectareasAcumuladas.toFixed(4)} ha — la suma no puede exceder la superficie del Cuadro.`
    );
  }
}

export class DiaCerradoAplicacionError extends Error {
  constructor() {
    super("La Huerta ya tiene cerrado el día de Nómina de este reporte — no se puede editar (candado de consistencia con Nómina).");
  }
}

export class NoSePuedeCancelarError extends Error {
  constructor(motivo: string) {
    super(motivo);
  }
}

export type ModalidadAplicacion = "mochila" | "turbina" | "aguilon";

// Ingrediente Activo, nunca marca (Prioridad 1, 3-sep-2026) — Programar ya
// no captura productoId directamente, solo el Ingrediente Activo; se
// resuelve al Producto preferido de ese Ingrediente al escribir (ver
// `resolverIngredientesAPlicacion` más abajo). Evita que distintos
// ingenieros programen distinta marca para lo mismo.
export interface ProductoAplicacionInput {
  ingredienteActivoNombre: string;
  concentracionValor: number;
  concentracionUnidad: ConcentracionUnidad;
}

interface ProductoAplicacionResuelto extends ProductoAplicacionInput {
  productoId: string;
}

async function resolverIngredientesAplicacion(productos: ProductoAplicacionInput[]): Promise<ProductoAplicacionResuelto[]> {
  return Promise.all(
    productos.map(async (p) => ({ ...p, productoId: await resolverProductoPreferidoPorNombre(p.ingredienteActivoNombre) }))
  );
}

export type ModoProgramacionCuadro = "por_cuadro" | "por_variedad";

export interface GrupoCuadroInput {
  cuadroId: string;
  hectareas: number;
}

export interface GrupoVariedadInput {
  cuadroId: string;
  variedad: string; // hectáreas se resuelven de la composición varietal del Ciclo, no se capturan
}

export interface GrupoAplicacionInput {
  litrosMezclaPorHa: number;
  cuadros?: GrupoCuadroInput[]; // modo por_cuadro
  variedades?: GrupoVariedadInput[]; // modo por_variedad
  productos: ProductoAplicacionInput[];
}

export interface ProgramarAplicacionInput {
  huertaId: string;
  modo: ModoProgramacionCuadro;
  // Grupos de dosis (V1 P2, 25-sep-2026, Bloque 3) — al menos uno; si el
  // usuario no arma grupos, el frontend manda un solo Grupo con todo.
  grupos: GrupoAplicacionInput[];
  recursoSugerido: ModalidadAplicacion;
  fechaInicio: string;
  fechaFin: string;
  comentario?: string;
  // Recetario (20-ago-2026): recetaId es solo trazabilidad de "de dónde
  // salió esta programación" — solo aplica si hay un único Grupo (la receta
  // es de un tanque, no de varios grupos con dosis distinta).
  recetaId?: string;
  capacidadTanque?: number;
  // Si viene una receta y el rol autorizado ajustó la dosis: además de usar
  // la dosis nueva en esta programación, actualiza también la receta
  // maestra para las próximas veces.
  actualizarRecetaOriginal?: boolean;
  // Tipo de aplicación — obligatorio desde V1 P2 (antes precargado de la
  // receta pero opcional).
  tipoAplicacionId: string;
}

export class ModoYaTieneGrupoConOtroModoError extends Error {
  constructor() {
    super("Todos los Grupos de una misma programación deben usar el mismo modo (por Cuadro o por Variedad), sin mezclarlos.");
  }
}

/** Hectáreas de una variedad en un Cuadro según la composición varietal vigente del Ciclo — hectareas si se capturó directo, si no porcentaje × superficie del Cuadro. */
async function hectareasDeVariedad(huertaId: string, cuadroId: string, variedad: string, fechaRef: Date): Promise<number> {
  const ciclo = await prisma.ciclo.findFirst({ where: { huertaId, activo: true }, include: { variedades: true } });
  const fila = ciclo?.variedades.find((v) => v.cuadroId === cuadroId && v.variedad === variedad);
  if (!fila) throw new Error(`No se encontró la variedad "${variedad}" en el Cuadro elegido, dentro del Ciclo activo de esta Huerta.`);
  if (fila.hectareas != null) return Number(fila.hectareas);
  if (fila.porcentaje != null) {
    const version = await obtenerVersionVigente(cuadroId, fechaRef);
    if (!version) throw new Error("El Cuadro elegido no tiene una configuración vigente para la fecha de inicio.");
    return (Number(fila.porcentaje) / 100) * Number(version.hectareas);
  }
  throw new Error(`La variedad "${variedad}" del Cuadro elegido no tiene hectáreas ni porcentaje capturados en el Ciclo.`);
}

/** Resuelve los miembros (Cuadro o Cuadro+Variedad) de un Grupo con sus hectáreas, y su suma. */
async function resolverMiembrosGrupo(
  huertaId: string,
  modo: ModoProgramacionCuadro,
  grupo: GrupoAplicacionInput,
  fechaRef: Date
): Promise<{ hectareasProgramadas: number; cuadros: { cuadroId: string; hectareas: number }[]; variedades: { cuadroId: string; variedad: string; hectareas: number }[] }> {
  if (modo === "por_cuadro") {
    if (!grupo.cuadros || grupo.cuadros.length === 0) throw new Error("Cada Grupo necesita al menos un Cuadro.");
    for (const c of grupo.cuadros) {
      const version = await obtenerVersionVigente(c.cuadroId, fechaRef);
      if (!version) throw new Error("Uno de los Cuadros elegidos no tiene una configuración vigente para la fecha de inicio.");
      if (c.hectareas <= 0 || c.hectareas > Number(version.hectareas) + 0.0001) {
        throw new Error(`Hectáreas inválidas para uno de los Cuadros: no pueden ser 0 ni exceder su superficie (${version.hectareas} ha).`);
      }
    }
    return { hectareasProgramadas: grupo.cuadros.reduce((s, c) => s + c.hectareas, 0), cuadros: grupo.cuadros, variedades: [] };
  }

  if (!grupo.variedades || grupo.variedades.length === 0) throw new Error("Cada Grupo necesita al menos una Variedad.");
  const variedades = await Promise.all(
    grupo.variedades.map(async (v) => ({ cuadroId: v.cuadroId, variedad: v.variedad, hectareas: await hectareasDeVariedad(huertaId, v.cuadroId, v.variedad, fechaRef) }))
  );
  return { hectareasProgramadas: variedades.reduce((s, v) => s + v.hectareas, 0), cuadros: [], variedades };
}

/** Codifica un miembro de Grupo como clave única — Cuadro solo, o Cuadro+Variedad ("::" no aparece en un cuadroId/variedad reales). */
function claveMiembro(cuadroId: string, variedad: string | null): string {
  return variedad ? `${cuadroId}::${variedad}` : cuadroId;
}
function parseClaveMiembro(clave: string): { cuadroId: string; variedad: string | null } {
  const idx = clave.indexOf("::");
  return idx === -1 ? { cuadroId: clave, variedad: null } : { cuadroId: clave.slice(0, idx), variedad: clave.slice(idx + 2) };
}

interface AplicacionGrupoParaReparto {
  id: string;
  hectareasProgramadas: Prisma.Decimal;
  cuadros: { cuadroId: string; hectareas: Prisma.Decimal }[];
  variedades: { cuadroId: string; variedad: string; hectareas: Prisma.Decimal }[];
}

/** Arma la entrada de `calcularRepartoAvance` (@cbf/shared) a partir de los Grupos ya guardados de una Aplicación. */
function gruposParaReparto(grupos: AplicacionGrupoParaReparto[]): GrupoPrograma<string>[] {
  return grupos.map((g) => ({
    grupoId: g.id,
    hectareasProgramadas: Number(g.hectareasProgramadas),
    miembros:
      g.cuadros.length > 0
        ? g.cuadros.map((c) => ({ clave: claveMiembro(c.cuadroId, null), hectareasProgramadas: Number(c.hectareas) }))
        : g.variedades.map((v) => ({ clave: claveMiembro(v.cuadroId, v.variedad), hectareasProgramadas: Number(v.hectareas) })),
  }));
}

/**
 * Paso 1, Programar (9.7, V1 P2 25-sep-2026): Huerta + modo (Por Cuadro o
 * Por Variedad, sin mezclar) repartido en uno o más Grupos de dosis, cada
 * uno con su propia receta (litros de mezcla/ha + concentración por
 * producto). Calcula la cantidad total de cada producto POR GRUPO, y para
 * cada uno, si el Almacén alcanza la aparta de inmediato ("comprometido");
 * si no alcanza, genera automático una orden de Compras por el faltante.
 */

export class RolNoPuedeAjustarRecetaError extends Error {
  constructor() {
    super("Tu rol solo puede usar esta receta tal cual está guardada — no puede cambiar la dosis. Pide a Dirección General o al Gerente Técnico de Producción que la ajuste.");
  }
}

/**
 * Recetario (20-ago-2026): valida que, si la programación viene de una
 * receta y quien la captura NO es Director General/Gerente Técnico de
 * Producción, la dosis (litros/ha compartido + concentración de cada
 * producto) coincida EXACTO con lo guardado en la receta — el candado real
 * vive aquí, no solo en que el frontend muestre el campo de solo lectura
 * (cualquiera podría llamar la API directo). Devuelve la receta cargada
 * para reutilizarla si aplica "actualizar receta original".
 */
async function validarUsoDeReceta(
  recetaId: string,
  usuarioRol: Rol,
  litrosMezclaPorHa: number,
  productos: ProductoAplicacionInput[]
) {
  const receta = await obtenerReceta(recetaId);
  if (!ROLES_RECETAS.includes(usuarioRol)) {
    const mismaAgua = Number(receta.litrosPorHa) === litrosMezclaPorHa;
    const mismasDosis = receta.productos.every((rp) => {
      // Comparación por Ingrediente Activo (Prioridad 1, 3-sep-2026) — la
      // receta guarda internamente el Producto preferido resuelto, pero lo
      // que capturó/envió el usuario es el Ingrediente Activo.
      const enviado = productos.find((p) => p.ingredienteActivoNombre === rp.producto.ingredienteActivo);
      return enviado && Number(rp.concentracionValor) === enviado.concentracionValor && rp.concentracionUnidad === enviado.concentracionUnidad;
    });
    if (!mismaAgua || !mismasDosis || receta.productos.length !== productos.length) {
      throw new RolNoPuedeAjustarRecetaError();
    }
  }
  return receta;
}

/**
 * Paso 1, Programar (9.7): calcula la cantidad total de cada producto (10-
 * ago-2026, varios productos en el mismo tanque — comparten litrosMezclaPorHa,
 * cada uno con su propia concentración), y para cada uno, si el Almacén
 * alcanza la aparta de inmediato ("comprometido"); si no alcanza, no
 * bloquea — genera automático una orden de Compras por el faltante, sin
 * requerir autorización adicional (ya la trae de quien programó). Cada
 * producto se autoriza/aparta/compra por separado, aunque se programen juntos.
 */
export async function programarAplicacion(input: ProgramarAplicacionInput, creadoPorId: string, usuarioRol: Rol) {
  if (!input.grupos || input.grupos.length === 0) throw new Error("Falta al menos un Grupo (si no armas Grupos, se programa como uno solo con todo).");
  if (input.recetaId && input.grupos.length > 1) throw new Error("Una Receta solo se puede usar cuando la programación tiene un único Grupo.");

  const fechaRef = new Date(input.fechaInicio);
  const gruposResueltos = await Promise.all(
    input.grupos.map(async (g) => {
      if (!g.productos || g.productos.length === 0) throw new Error("Cada Grupo necesita al menos un producto.");
      const miembros = await resolverMiembrosGrupo(input.huertaId, input.modo, g, fechaRef);
      const productosResueltos = await resolverIngredientesAplicacion(g.productos);
      const productos = await prisma.producto.findMany({ where: { id: { in: productosResueltos.map((p) => p.productoId) } } });
      for (const p of productos) {
        if (!(await categoriaRequiereIngredienteActivo(p.categoria)) || !p.autorizado) throw new ProductoNoAutorizadoAplicacionError();
      }
      return { input: g, miembros, productosResueltos };
    })
  );

  if (input.recetaId) {
    const g = gruposResueltos[0]!;
    await validarUsoDeReceta(input.recetaId, usuarioRol, g.input.litrosMezclaPorHa, g.input.productos);
    if (input.actualizarRecetaOriginal) {
      for (const p of g.productosResueltos) {
        await actualizarDosisProductoEnReceta(input.recetaId, p.productoId, p.concentracionValor, p.concentracionUnidad);
      }
    }
  }

  const hectareasTotales = gruposResueltos.reduce((s, g) => s + g.miembros.hectareasProgramadas, 0);

  return prisma.$transaction(async (tx) => {
    const aplicacion = await tx.aplicacion.create({
      data: {
        huertaId: input.huertaId,
        modo: input.modo,
        recursoSugerido: input.recursoSugerido,
        recetaId: input.recetaId,
        capacidadTanque: input.capacidadTanque,
        tipoAplicacionId: input.tipoAplicacionId,
        comentario: input.comentario,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        hectareasTotalesProgramadas: hectareasTotales,
        creadoPorId,
      },
    });

    for (let i = 0; i < gruposResueltos.length; i++) {
      const g = gruposResueltos[i]!;
      const grupo = await tx.aplicacionGrupo.create({
        data: {
          aplicacionId: aplicacion.id,
          orden: i + 1,
          litrosMezclaPorHa: g.input.litrosMezclaPorHa,
          hectareasProgramadas: g.miembros.hectareasProgramadas,
        },
      });
      if (input.modo === "por_cuadro") {
        await tx.aplicacionGrupoCuadro.createMany({
          data: g.miembros.cuadros.map((c) => ({ grupoId: grupo.id, cuadroId: c.cuadroId, hectareas: c.hectareas })),
        });
      } else {
        await tx.aplicacionGrupoVariedad.createMany({
          data: g.miembros.variedades.map((v) => ({ grupoId: grupo.id, cuadroId: v.cuadroId, variedad: v.variedad, hectareas: v.hectareas })),
        });
      }

      for (const p of g.productosResueltos) {
        const cantidadTotalCalculada = calcularCantidadTotal(p.concentracionValor, p.concentracionUnidad, g.input.litrosMezclaPorHa, g.miembros.hectareasProgramadas);
        await tx.aplicacionProducto.create({
          data: {
            grupoId: grupo.id,
            aplicacionId: aplicacion.id,
            productoId: p.productoId,
            concentracionValor: p.concentracionValor,
            concentracionUnidad: p.concentracionUnidad,
            cantidadTotalCalculada,
          },
        });
      }
    }

    // Comprometer/comprar por producto ÚNICO, sumado a través de TODOS los
    // Grupos (Almacén Central no distingue Grupos) — si el mismo producto
    // aparece en 2+ Grupos, se apartaría/compraría dos veces si se hiciera
    // por Grupo (intentarComprometer es idempotente por referenciaId+producto).
    const cantidadTotalPorProducto = new Map<string, number>();
    for (const g of gruposResueltos) {
      for (const p of g.productosResueltos) {
        const cantidad = calcularCantidadTotal(p.concentracionValor, p.concentracionUnidad, g.input.litrosMezclaPorHa, g.miembros.hectareasProgramadas);
        cantidadTotalPorProducto.set(p.productoId, (cantidadTotalPorProducto.get(p.productoId) ?? 0) + cantidad);
      }
    }
    for (const [productoId, cantidadTotalCalculada] of cantidadTotalPorProducto) {
      const comprometido = await intentarComprometer(tx, productoId, cantidadTotalCalculada, aplicacion.id, creadoPorId);
      if (!comprometido) {
        const disponible = await stockTotalProductoTx(tx, productoId);
        const faltante = cantidadTotalCalculada - disponible;
        await tx.ordenCompra.create({
          data: {
            origen: "automatica",
            productoId,
            cantidadSolicitada: faltante,
            estado: "pendiente_cotizar",
            referenciaAplicacionId: aplicacion.id,
            creadoPorId,
          },
        });
      }
    }
    return aplicacion;
  });
}

export class YaHayAvanceReportadoError extends Error {
  constructor() {
    super("Esta Aplicación ya tiene reportes de avance — no se puede editar la dosis, cancélala y reprograma con los datos correctos.");
  }
}

/**
 * Editar el Paso 1 de una Aplicación ya programada/entregada (9.7,
 * 15-ago-2026, reabre decisión previa; V1 P2 25-sep-2026: ahora sobre
 * Grupos): permitido mientras no exista ningún reporte de avance todavía.
 * Se borran y recrean TODOS los Grupos/miembros/productos — el ajuste de
 * Almacén se calcula agregando por productoId a través de todos los Grupos
 * (antes vs. después), igual criterio que antes de que existieran Grupos:
 * - Sube: intenta apartar la diferencia; si no alcanza, genera compra
 *   automática. Si ya estaba "entregada", la diferencia se entrega también.
 * - Baja: libera el compromiso, o si ya se entregó, regresa el sobrante del
 *   Almacén Local al Central como abono (sin confirmar hasta que Bodega lo
 *   reciba físicamente de vuelta).
 */
export async function editarAplicacionProgramada(aplicacionId: string, input: Omit<ProgramarAplicacionInput, "huertaId">, editadoPorId: string, usuarioRol: Rol) {
  if (!input.grupos || input.grupos.length === 0) throw new Error("Falta al menos un Grupo.");
  if (input.recetaId && input.grupos.length > 1) throw new Error("Una Receta solo se puede usar cuando la programación tiene un único Grupo.");

  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({
    where: { id: aplicacionId },
    include: { productosDenormalizado: true, realizadas: true, huerta: true },
  });
  if (aplicacion.estado !== "programada" && aplicacion.estado !== "entregada") {
    throw new TransicionAplicacionInvalidaError("programada o entregada");
  }
  if (aplicacion.realizadas.length > 0) throw new YaHayAvanceReportadoError();

  const fechaRef = new Date(input.fechaInicio);
  const gruposResueltos = await Promise.all(
    input.grupos.map(async (g) => {
      if (!g.productos || g.productos.length === 0) throw new Error("Cada Grupo necesita al menos un producto.");
      const miembros = await resolverMiembrosGrupo(aplicacion.huertaId, input.modo, g, fechaRef);
      const productosResueltos = await resolverIngredientesAplicacion(g.productos);
      const productosNuevos = await prisma.producto.findMany({ where: { id: { in: productosResueltos.map((p) => p.productoId) } } });
      for (const p of productosNuevos) {
        if (!(await categoriaRequiereIngredienteActivo(p.categoria)) || !p.autorizado) throw new ProductoNoAutorizadoAplicacionError();
      }
      return { input: g, miembros, productosResueltos };
    })
  );

  const recetaId = input.recetaId ?? aplicacion.recetaId ?? undefined;
  if (recetaId) {
    const g = gruposResueltos[0]!;
    await validarUsoDeReceta(recetaId, usuarioRol, g.input.litrosMezclaPorHa, g.input.productos);
    if (input.actualizarRecetaOriginal) {
      for (const p of g.productosResueltos) {
        await actualizarDosisProductoEnReceta(recetaId, p.productoId, p.concentracionValor, p.concentracionUnidad);
      }
    }
  }

  const hectareasTotales = gruposResueltos.reduce((s, g) => s + g.miembros.hectareasProgramadas, 0);
  const entregada = aplicacion.estado === "entregada";

  // Cantidad anterior/nueva por producto, agregada a través de TODOS los Grupos.
  const cantidadAnteriorPorProducto = new Map<string, number>();
  for (const p of aplicacion.productosDenormalizado) {
    cantidadAnteriorPorProducto.set(p.productoId, (cantidadAnteriorPorProducto.get(p.productoId) ?? 0) + Number(p.cantidadTotalCalculada));
  }
  const cantidadNuevaPorProducto = new Map<string, number>();
  for (const g of gruposResueltos) {
    for (const p of g.productosResueltos) {
      const cantidad = calcularCantidadTotal(p.concentracionValor, p.concentracionUnidad, g.input.litrosMezclaPorHa, g.miembros.hectareasProgramadas);
      cantidadNuevaPorProducto.set(p.productoId, (cantidadNuevaPorProducto.get(p.productoId) ?? 0) + cantidad);
    }
  }
  const productoIdsTocados = new Set([...cantidadAnteriorPorProducto.keys(), ...cantidadNuevaPorProducto.keys()]);

  return prisma.$transaction(async (tx) => {
    for (const productoId of productoIdsTocados) {
      const anterior = cantidadAnteriorPorProducto.get(productoId) ?? 0;
      const nueva = cantidadNuevaPorProducto.get(productoId) ?? 0;
      await ajustarCantidadProducto(tx, aplicacion.huertaId, aplicacionId, productoId, anterior, nueva, entregada, editadoPorId);
    }

    // Borra y recrea Grupos/miembros/productos completos (más simple/seguro que diferenciar Grupo por Grupo).
    const gruposViejos = await tx.aplicacionGrupo.findMany({ where: { aplicacionId }, select: { id: true } });
    const grupoIdsViejos = gruposViejos.map((g) => g.id);
    await tx.aplicacionProducto.deleteMany({ where: { aplicacionId } });
    await tx.aplicacionGrupoCuadro.deleteMany({ where: { grupoId: { in: grupoIdsViejos } } });
    await tx.aplicacionGrupoVariedad.deleteMany({ where: { grupoId: { in: grupoIdsViejos } } });
    await tx.aplicacionGrupo.deleteMany({ where: { aplicacionId } });
    for (let i = 0; i < gruposResueltos.length; i++) {
      const g = gruposResueltos[i]!;
      const grupo = await tx.aplicacionGrupo.create({
        data: { aplicacionId, orden: i + 1, litrosMezclaPorHa: g.input.litrosMezclaPorHa, hectareasProgramadas: g.miembros.hectareasProgramadas },
      });
      if (input.modo === "por_cuadro") {
        await tx.aplicacionGrupoCuadro.createMany({
          data: g.miembros.cuadros.map((c) => ({ grupoId: grupo.id, cuadroId: c.cuadroId, hectareas: c.hectareas })),
        });
      } else {
        await tx.aplicacionGrupoVariedad.createMany({
          data: g.miembros.variedades.map((v) => ({ grupoId: grupo.id, cuadroId: v.cuadroId, variedad: v.variedad, hectareas: v.hectareas })),
        });
      }
      for (const p of g.productosResueltos) {
        const cantidadTotalCalculada = calcularCantidadTotal(p.concentracionValor, p.concentracionUnidad, g.input.litrosMezclaPorHa, g.miembros.hectareasProgramadas);
        await tx.aplicacionProducto.create({
          data: {
            grupoId: grupo.id,
            aplicacionId,
            productoId: p.productoId,
            concentracionValor: p.concentracionValor,
            concentracionUnidad: p.concentracionUnidad,
            cantidadTotalCalculada,
          },
        });
      }
    }

    return tx.aplicacion.update({
      where: { id: aplicacionId },
      data: {
        modo: input.modo,
        recursoSugerido: input.recursoSugerido,
        capacidadTanque: input.capacidadTanque,
        tipoAplicacionId: input.tipoAplicacionId,
        comentario: input.comentario,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        hectareasTotalesProgramadas: hectareasTotales,
      },
    });
  });
}

/**
 * La lista también trae `comprometido`/alertas, no solo el detalle — si no,
 * el botón "Confirmar entrega" del listado nunca aparecería (el campo
 * vendría `undefined` en vez de `true`) aunque la aplicación sí esté
 * comprometida; se descubrió probando la pantalla real con datos que
 * seguían en "programada" al momento de revisar la lista.
 */
const INCLUDE_LINEA = { tractor: true, operador: true, implemento: true, personas: { include: { personal: true } } };

const INCLUDE_GRUPO = {
  cuadros: { include: { cuadro: true } },
  variedades: { include: { cuadro: true } },
  productos: { include: { producto: true } },
};

const INCLUDE_APLICACION = {
  huerta: true,
  tipoAplicacion: true,
  grupos: { include: INCLUDE_GRUPO, orderBy: { orden: "asc" as const } },
  realizadas: {
    include: { grupos: { include: { cuadros: { include: { cuadro: true } } } }, lineas: { include: INCLUDE_LINEA } },
    orderBy: { fechaReal: "desc" as const },
  },
};

/** 9.15 (31-ago-2026): Cuadros en orden numérico ("Cuadro 2" antes que "Cuadro 10"), no alfabético — dentro de cada Grupo. */
function ordenarCuadrosDe<T extends { grupos: { cuadros: { cuadro: { nombre: string } }[] }[] }>(item: T): T {
  for (const g of item.grupos) g.cuadros = ordenarPorNombreNumerico(g.cuadros, (c) => c.cuadro.nombre);
  return item;
}

/**
 * Por default no trae las "vencida" (liberadas) ni "cancelada" — se
 * quedaban en la lista para siempre sin forma de dejar de verlas (bug real
 * reportado por Diego, 31-ago-2026, ampliado a "cancelada" el mismo día).
 * Siguen existiendo en la base (no se borran, por trazabilidad de
 * Almacén); `incluirCerradas` las trae de vuelta.
 */
export async function listarAplicaciones(huertaId?: string, incluirCerradas?: boolean) {
  const aplicaciones = await prisma.aplicacion.findMany({
    where: { huertaId, ...(incluirCerradas ? {} : { estado: { notIn: ["vencida", "cancelada"] } }) },
    include: INCLUDE_APLICACION,
    orderBy: { fechaCreacion: "desc" },
  });
  aplicaciones.forEach(ordenarCuadrosDe);
  return Promise.all(aplicaciones.map((a) => enriquecerConAlertas(a)));
}

type GrupoConRealizadas = {
  id: string;
  litrosMezclaPorHa: Prisma.Decimal;
  hectareasProgramadas: Prisma.Decimal;
  cuadros: { cuadroId: string; hectareas: Prisma.Decimal; cuadro: { nombre: string } }[];
  variedades: { cuadroId: string; variedad: string; hectareas: Prisma.Decimal }[];
  productos: { productoId: string; cantidadTotalCalculada: Prisma.Decimal; concentracionValor: Prisma.Decimal; concentracionUnidad: ConcentracionUnidad }[];
};

type AplicacionConRealizadas = {
  id: string;
  estado: string;
  fechaInicio: Date;
  fechaFin: Date;
  hectareasTotalesProgramadas: Prisma.Decimal;
  capacidadTanque: Prisma.Decimal | null;
  grupos: GrupoConRealizadas[];
  realizadas: { id: string; hectareas: Prisma.Decimal; grupos: { grupoId: string; hectareasAtribuidas: Prisma.Decimal; cuadros: { cuadroId: string; variedad: string | null; hectareasAtribuidas: Prisma.Decimal }[] }[]; lineas: { horas: Prisma.Decimal }[] }[];
};

/**
 * Mezcla por tanque (bloque nuevo, 20-ago-2026; V1 P2 25-sep-2026: por
 * Grupo, cada uno con su propia receta) — calculado al vuelo, no se
 * persiste. Null si esta Aplicación no capturó capacidad de tanque.
 */
function calcularMezclaPorTanqueDeAplicacion(aplicacion: AplicacionConRealizadas) {
  if (aplicacion.capacidadTanque == null) return null;
  const capacidadTanque = Number(aplicacion.capacidadTanque);
  return aplicacion.grupos.map((g) => ({
    grupoId: g.id,
    productos: g.productos.map((p) => ({
      productoId: p.productoId,
      ...calcularMezclaPorTanque(Number(p.concentracionValor), p.concentracionUnidad, Number(g.litrosMezclaPorHa), capacidadTanque, Number(g.hectareasProgramadas)),
    })),
  }));
}

/**
 * Nota estimada de tanque pendiente (Prioridad 2, 3-sep-2026; V1 P2
 * 25-sep-2026: por Grupo — regla "Nota de tanque a medias: por grupo").
 * `hectareasAtribuidasPorGrupo` viene de sumar lo ya reportado a cada Grupo.
 */
type AplicacionParaNotaTanque = {
  capacidadTanque: Prisma.Decimal | null;
  grupos: { id: string; litrosMezclaPorHa: Prisma.Decimal; productos: { productoId: string; concentracionValor: Prisma.Decimal; concentracionUnidad: ConcentracionUnidad }[] }[];
};

function calcularNotaTanquePendienteDeAplicacion(aplicacion: AplicacionParaNotaTanque, hectareasAtribuidasPorGrupo: Map<string, number>) {
  if (aplicacion.capacidadTanque == null) return null;
  const capacidadTanque = Number(aplicacion.capacidadTanque);
  const resultado: { grupoId: string; productos: { productoId: string; tanquesNecesarios: number; cantidadProductoPendiente: number }[] }[] = [];
  for (const g of aplicacion.grupos) {
    const avanzadas = hectareasAtribuidasPorGrupo.get(g.id) ?? 0;
    const porProducto = g.productos
      .map((p) => ({
        productoId: p.productoId,
        ...calcularTanquePendiente(Number(p.concentracionValor), p.concentracionUnidad, Number(g.litrosMezclaPorHa), capacidadTanque, avanzadas),
      }))
      .filter((p): p is { productoId: string } & NonNullable<ReturnType<typeof calcularTanquePendiente>> => p.tanquesNecesarios != null);
    if (porProducto.length > 0) resultado.push({ grupoId: g.id, productos: porProducto });
  }
  return resultado.length > 0 ? resultado : null;
}

/**
 * Nota de tanque pendiente por Huerta+Producto (Prioridad 2, 3-sep-2026) —
 * sumado entre TODAS las Aplicaciones/Grupos activos de una Huerta que
 * usan ese producto, para mostrarlo junto al total simple de Almacén Local.
 */
export async function notaTanquePendientePorHuertaProducto(huertaId: string): Promise<Record<string, number>> {
  const aplicaciones = await prisma.aplicacion.findMany({
    where: { huertaId, estado: { notIn: ["vencida", "cancelada"] }, capacidadTanque: { not: null } },
    include: { grupos: { include: { productos: true } }, realizadas: { include: { grupos: true } } },
  });

  const totales: Record<string, number> = {};
  for (const aplicacion of aplicaciones) {
    const hectareasAtribuidasPorGrupo = new Map<string, number>();
    for (const r of aplicacion.realizadas) {
      for (const rg of r.grupos) {
        hectareasAtribuidasPorGrupo.set(rg.grupoId, (hectareasAtribuidasPorGrupo.get(rg.grupoId) ?? 0) + Number(rg.hectareasAtribuidas));
      }
    }
    const nota = calcularNotaTanquePendienteDeAplicacion(aplicacion, hectareasAtribuidasPorGrupo);
    if (!nota) continue;
    for (const g of nota) {
      for (const p of g.productos) {
        totales[p.productoId] = (totales[p.productoId] ?? 0) + p.cantidadProductoPendiente;
      }
    }
  }
  return totales;
}

/** Hectáreas restantes por Cuadro/Variedad (9.7, 8-ago-2026; V1 P2 25-sep-2026): lo que falta de reportar de cada miembro programado, para mostrarlo visible. `excluirRealizadaId` se usa al editar un reporte existente. */
function hectareasRestantesPorMiembro(aplicacion: AplicacionConRealizadas, excluirRealizadaId?: string): Record<string, number> {
  const programadoPorClave = new Map<string, number>();
  for (const g of aplicacion.grupos) {
    if (g.cuadros.length > 0) {
      for (const c of g.cuadros) programadoPorClave.set(claveMiembro(c.cuadroId, null), (programadoPorClave.get(claveMiembro(c.cuadroId, null)) ?? 0) + Number(c.hectareas));
    } else {
      for (const v of g.variedades) programadoPorClave.set(claveMiembro(v.cuadroId, v.variedad), (programadoPorClave.get(claveMiembro(v.cuadroId, v.variedad)) ?? 0) + Number(v.hectareas));
    }
  }
  const reportadoPorClave = new Map<string, number>();
  for (const r of aplicacion.realizadas) {
    if (r.id === excluirRealizadaId) continue;
    for (const rg of r.grupos) {
      for (const rc of rg.cuadros) {
        const clave = claveMiembro(rc.cuadroId, rc.variedad);
        reportadoPorClave.set(clave, (reportadoPorClave.get(clave) ?? 0) + Number(rc.hectareasAtribuidas));
      }
    }
  }
  const restantes: Record<string, number> = {};
  for (const [clave, total] of programadoPorClave) {
    restantes[clave] = Math.max(0, total - (reportadoPorClave.get(clave) ?? 0));
  }
  return restantes;
}

async function enriquecerConAlertas<T extends AplicacionConRealizadas>(aplicacion: T, tx: TransactionClient | typeof prisma = prisma) {
  // Comprometido/entregado a nivel Aplicación = TODOS sus productos lo están
  // (10-ago-2026, varios productos): si uno todavía espera compra, la
  // Aplicación completa se queda en "programada" hasta que los demás alcancen.
  const productos = aplicacion.grupos.flatMap((g) => g.productos);
  const movimientosComprometido = await tx.almacenCentralMovimiento.findMany({
    where: { referenciaId: aplicacion.id, tipo: "salida_comprometida" },
  });
  const movimientosEntrega = await tx.almacenCentralMovimiento.findMany({
    where: { referenciaId: aplicacion.id, tipo: "salida_real" },
  });
  const comprometido = productos.every((p) => movimientosComprometido.some((m) => m.productoId === p.productoId));
  const entrega = movimientosEntrega[0];

  // Plazos (V1 P2, 25-sep-2026): "nunca salió de bodega" cuenta desde
  // FECHA DE INICIO de la programación (antes: fechaCreacion); "entregado
  // y no aplicado al 100%" cuenta desde FECHA FIN (antes: fecha real de la
  // entrega) — ambos anclados a lo que el usuario programó, no a cuándo
  // pasaron los pasos internos.
  const diasSinEntregar = aplicacion.estado === "programada" ? Math.floor((Date.now() - aplicacion.fechaInicio.getTime()) / 86_400_000) : null;
  const diasSinAplicar =
    aplicacion.estado === "entregada" || aplicacion.estado === "realizada"
      ? Math.floor((Date.now() - aplicacion.fechaFin.getTime()) / 86_400_000)
      : null;

  const hectareasAvanzadas = aplicacion.realizadas.reduce((s, r) => s + Number(r.hectareas), 0);
  const horasHombreTotales = aplicacion.realizadas.reduce((s, r) => s + r.lineas.reduce((s2, l) => s2 + Number(l.horas), 0), 0);
  const porcentajeAvance = Number(aplicacion.hectareasTotalesProgramadas) > 0 ? (hectareasAvanzadas / Number(aplicacion.hectareasTotalesProgramadas)) * 100 : 0;
  const restantesPorMiembro = hectareasRestantesPorMiembro(aplicacion);

  const hectareasAtribuidasPorGrupo = new Map<string, number>();
  for (const r of aplicacion.realizadas) {
    for (const rg of r.grupos) hectareasAtribuidasPorGrupo.set(rg.grupoId, (hectareasAtribuidasPorGrupo.get(rg.grupoId) ?? 0) + Number(rg.hectareasAtribuidas));
  }

  return {
    ...aplicacion,
    comprometido,
    diasSinEntregar,
    alertaVencimiento: (diasSinEntregar ?? 0) > DIAS_VENCIMIENTO,
    diasSinAplicar,
    alertaPendienteAplicar: (diasSinAplicar ?? 0) > DIAS_VENCIMIENTO && porcentajeAvance < 100,
    hectareasAvanzadas,
    horasHombreTotales,
    porcentajeAvance,
    restantesPorMiembro,
    mezclaPorTanque: calcularMezclaPorTanqueDeAplicacion(aplicacion),
    notaTanquePendiente: calcularNotaTanquePendienteDeAplicacion(aplicacion, hectareasAtribuidasPorGrupo),
  };
}

export async function obtenerAplicacion(id: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({
    where: { id },
    include: INCLUDE_APLICACION,
  });
  ordenarCuadrosDe(aplicacion);
  return enriquecerConAlertas(aplicacion);
}

/**
 * Confirma la entrega física de TODOS los productos a la Huerta (9.7) —
 * acción de Almacén, no de quien programó. Solo puede pasar si ya hay stock
 * comprometido para cada producto de esta aplicación.
 *
 * `overridesPorProducto` (V1 P1, 25-sep-2026, regla e): si Bodega dictamina
 * que un producto salió (o debe salir) de un lote distinto al que el
 * sistema sugirió por FIFO al comprometer, se pasa aquí su loteId elegido
 * y el motivo — el movimiento real queda marcado "fuera de orden".
 */
export async function confirmarEntrega(
  aplicacionId: string,
  capturadoPorId: string,
  overridesPorProducto?: Record<string, { loteIdElegido: string; motivo: string }>
) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId }, include: { productosDenormalizado: true } });
  if (aplicacion.estado !== "programada") throw new TransicionAplicacionInvalidaError("programada");

  // Por producto ÚNICO, sumado a través de todos los Grupos (Almacén
  // Central no distingue Grupos — ver mismo criterio en programarAplicacion).
  const cantidadPorProducto = new Map<string, number>();
  for (const p of aplicacion.productosDenormalizado) {
    cantidadPorProducto.set(p.productoId, (cantidadPorProducto.get(p.productoId) ?? 0) + Number(p.cantidadTotalCalculada));
  }

  return prisma.$transaction(async (tx) => {
    const comprometidos = await tx.almacenCentralMovimiento.findMany({
      where: { referenciaId: aplicacionId, tipo: "salida_comprometida" },
    });
    const faltaAlguno = [...cantidadPorProducto.keys()].some((productoId) => !comprometidos.some((m) => m.productoId === productoId));
    if (faltaAlguno) throw new StockNoComprometidoError();

    for (const [productoId, cantidad] of cantidadPorProducto) {
      await confirmarEntregaComprometida(tx, productoId, aplicacion.huertaId, cantidad, aplicacionId, capturadoPorId, overridesPorProducto?.[productoId]);
    }
    return tx.aplicacion.update({ where: { id: aplicacionId }, data: { estado: "entregada" } });
  });
}

/**
 * Para la pantalla de "Confirmar entrega": qué lote(s) sugirió el sistema
 * por FIFO para cada producto de esta Aplicación, y qué otros lotes (con
 * existencia) hay disponibles por si Bodega quiere elegir otro (regla e).
 */
export async function opcionesLoteParaEntrega(aplicacionId: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId }, include: { productosDenormalizado: true } });
  const productoIdsUnicos = [...new Set(aplicacion.productosDenormalizado.map((p) => p.productoId))];
  const resultado = [];
  for (const productoId of productoIdsUnicos) {
    const comprometidos = await prisma.almacenCentralMovimiento.findMany({
      where: { referenciaId: aplicacionId, productoId, tipo: "salida_comprometida", loteId: { not: null } },
      include: { lote: true },
    });
    const otrosLotes = await prisma.productoLote.findMany({
      where: { productoId, cantidadActual: { gt: 0 } },
      orderBy: { fechaLlegada: "asc" },
    });
    resultado.push({
      productoId,
      loteSugerido: comprometidos.map((m) => ({ loteId: m.loteId, numeroLote: m.lote?.numeroLote ?? null, cantidad: Number(m.cantidad) })),
      otrosLotesConExistencia: otrosLotes.map((l) => ({ loteId: l.id, numeroLote: l.numeroLote, cantidadActual: Number(l.cantidadActual) })),
    });
  }
  return resultado;
}

export interface LineaRealizadaInput {
  modalidad: ModalidadAplicacion;
  tractorId?: string;
  operadorId?: string;
  implementoId?: string;
  horas: number;
  personalIds: string[];
}

export interface RegistrarRealizadaInput {
  fechaReal: string;
  // V1 P2, 25-sep-2026: el avance ya NO indica Cuadro/Variedad/Grupo — solo
  // hectáreas totales de este reporte; el sistema reparte el resto.
  hectareas: number;
  lineas: LineaRealizadaInput[];
  casoExtraordinario?: boolean;
  comentario?: string;
}

/**
 * Captura de maquinaria y personas por reporte (9.7, confirmado 8-ago-2026):
 * cada línea es una de las 3 modalidades fijas. Turbina/Aguilón exigen
 * Tractor+Operador+Implemento; Aguilón además necesita su propia gente
 * detrás; Mochila solo lleva gente, sin tractor/implemento; Turbina no
 * lleva gente extra (el operador ya está contado aparte).
 */
function validarLineas(lineas: LineaRealizadaInput[]) {
  if (!lineas || lineas.length === 0) {
    throw new Error("Falta capturar al menos una línea de recurso (Mochila, Turbina o Aguilón) en este reporte.");
  }
  for (const l of lineas) {
    if (l.modalidad === "mochila") {
      if (l.tractorId || l.operadorId || l.implementoId) {
        throw new Error("Una línea de Mochila no lleva tractor ni implemento.");
      }
      if (!l.personalIds || l.personalIds.length === 0) {
        throw new Error("Una línea de Mochila necesita al menos una persona.");
      }
    } else {
      if (!l.tractorId || !l.operadorId || !l.implementoId) {
        throw new Error(`Una línea de ${l.modalidad === "turbina" ? "Turbina" : "Aguilón"} necesita Tractor, Operador e Implemento.`);
      }
      if (l.modalidad === "turbina" && l.personalIds && l.personalIds.length > 0) {
        throw new Error("Una línea de Turbina no lleva gente extra detrás.");
      }
      if (l.modalidad === "aguilon" && (!l.personalIds || l.personalIds.length === 0)) {
        throw new Error("Una línea de Aguilón necesita al menos una persona detrás del tractor.");
      }
    }
  }
}

/** Personas que cobran mano de obra por esta línea — el operador (si aplica) más la lista de personas. */
function personasAPagarDeLinea(l: LineaRealizadaInput): string[] {
  return l.modalidad === "mochila" ? l.personalIds : [l.operadorId!, ...l.personalIds];
}

export class DiaCerradoRequiereCasoExtraordinarioError extends Error {
  constructor() {
    super(
      "La Huerta ya tiene cerrado el día de Nómina de esta fecha — para que este registro cuente, se necesita autorización de caso extraordinario (Encargado de Nóminas, Director General o Gerente Administrativo)."
    );
  }
}

export class SuperficieExcedeProgramadoError extends Error {
  constructor(hectareasProgramadas: number, hectareasAcumuladas: number) {
    super(
      `Esta Aplicación tiene ${hectareasProgramadas} ha programadas, pero entre todos los reportes se acumularían ${hectareasAcumuladas.toFixed(4)} ha — la suma no puede exceder lo programado.`
    );
  }
}

/**
 * Descuenta el Almacén Local de cada producto de UN Grupo, proporcional a
 * lo atribuido a ESE Grupo en este reporte (V1 P2, 25-sep-2026, regla:
 * "cada avance descuenta del Almacén Local lo proporcional — hectáreas
 * atribuidas al grupo × dosis del grupo"; el descuento "una sola vez al
 * marcar realizada" que pedía eliminarse nunca existió aquí — este cálculo
 * proporcional por reporte ya era así desde el 10-ago-2026).
 */
async function descontarAlmacenLocalPorGrupo(
  tx: TransactionClient,
  huertaId: string,
  productos: { productoId: string; cantidadTotalCalculada: Prisma.Decimal }[],
  hectareasAtribuidasGrupo: number,
  hectareasProgramadasGrupo: number,
  referenciaId: string,
  capturadoPorId: string
) {
  for (const p of productos) {
    const cantidadEsteReporte = proporcionDelGrupo(hectareasAtribuidasGrupo, hectareasProgramadasGrupo, Number(p.cantidadTotalCalculada));
    const local = await tx.almacenLocal.upsert({
      where: { huertaId_productoId: { huertaId, productoId: p.productoId } },
      update: { cantidadReportadaAcumulada: { increment: cantidadEsteReporte } },
      create: { huertaId, productoId: p.productoId, cantidadReportadaAcumulada: cantidadEsteReporte },
    });
    await tx.almacenLocalMovimiento.create({
      data: { almacenLocalId: local.id, tipo: "consumo_reportado", cantidad: cantidadEsteReporte, referenciaId, capturadoPorId },
    });
  }
}

/**
 * Paso 2, Registrar como realizada (9.7, V1 P2 25-sep-2026) — solo después
 * de la entrega. El reporte YA NO indica Cuadro/Variedad/Grupo, solo
 * hectáreas totales — el sistema reparte a Grupos y de ahí a
 * Cuadros/Variedades en proporción a lo programado (ver
 * calcularRepartoAvance en @cbf/shared) y GUARDA ese reparto calculado —
 * nunca se recalculan reportes anteriores. Descuento de Almacén Local y
 * mano de obra, ambos proporcionales a lo atribuido en ESTE reporte.
 */
export async function registrarRealizada(aplicacionId: string, input: RegistrarRealizadaInput, registradoPorId: string) {
  validarLineas(input.lineas);
  if (!input.hectareas || input.hectareas <= 0) throw new Error("Captura las hectáreas avanzadas en este reporte.");

  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({
    where: { id: aplicacionId },
    include: { grupos: { include: INCLUDE_GRUPO }, realizadas: { select: { hectareas: true } } },
  });
  if (aplicacion.estado !== "entregada" && aplicacion.estado !== "realizada") {
    throw new Error(
      "No se ha entregado el producto a esta Huerta todavía — Almacén debe confirmar la entrega antes de registrar la aplicación como realizada."
    );
  }

  const yaReportadas = aplicacion.realizadas.reduce((s, r) => s + Number(r.hectareas), 0);
  const totalConEste = yaReportadas + input.hectareas;
  if (totalConEste > Number(aplicacion.hectareasTotalesProgramadas) + 0.0001) {
    throw new SuperficieExcedeProgramadoError(Number(aplicacion.hectareasTotalesProgramadas), totalConEste);
  }

  // Registro automático llegando después del cierre del día (9.11): no entra solo — exige caso extraordinario ya autorizado por el llamador (verificado en la ruta).
  if ((await diaEstaCerrado(aplicacion.huertaId, input.fechaReal)) && !input.casoExtraordinario) {
    throw new DiaCerradoRequiereCasoExtraordinarioError();
  }

  const actividad = await prisma.actividad.findFirstOrThrow({ where: { nombre: NOMBRE_ACTIVIDAD_APLICACION } });
  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
  const esPrimeraVezRealizada = aplicacion.estado === "entregada";

  const reparto = calcularRepartoAvance(gruposParaReparto(aplicacion.grupos), input.hectareas);

  return prisma.$transaction(async (tx) => {
    const realizada = await tx.aplicacionRealizada.create({
      data: { aplicacionId, fechaReal: new Date(input.fechaReal), registradoPorId, comentario: input.comentario, hectareas: input.hectareas },
    });

    for (const pg of reparto.porGrupo) {
      const rg = await tx.aplicacionRealizadaGrupo.create({
        data: { realizadaId: realizada.id, grupoId: pg.grupoId, hectareasAtribuidas: pg.hectareasAtribuidas },
      });
      for (const m of reparto.porMiembro.filter((x) => x.grupoId === pg.grupoId)) {
        const { cuadroId, variedad } = parseClaveMiembro(m.clave);
        await tx.aplicacionRealizadaGrupoCuadro.create({
          data: { realizadaGrupoId: rg.id, cuadroId, variedad, hectareasAtribuidas: m.hectareasAtribuidas },
        });
      }
    }

    await crearLineasYNomina(tx, realizada.id, aplicacion.huertaId, input.fechaReal, input.hectareas, input.lineas, reparto, actividad.id, tarifaAplicada, registradoPorId);

    if (esPrimeraVezRealizada) {
      await tx.aplicacion.update({ where: { id: aplicacionId }, data: { estado: "realizada" } });
    }

    for (const grupo of aplicacion.grupos) {
      const atribuidoGrupo = reparto.porGrupo.find((pg) => pg.grupoId === grupo.id)?.hectareasAtribuidas ?? 0;
      await descontarAlmacenLocalPorGrupo(tx, aplicacion.huertaId, grupo.productos, atribuidoGrupo, Number(grupo.hectareasProgramadas), realizada.id, registradoPorId);
    }

    return tx.aplicacionRealizada.findUniqueOrThrow({
      where: { id: realizada.id },
      include: { grupos: { include: { cuadros: { include: { cuadro: true } } } }, lineas: { include: INCLUDE_LINEA } },
    });
  });
}

/**
 * Crea las líneas de un reporte + su mano de obra automática + su
 * alimentación a Uso Diario — compartido entre crear y editar (V1 P2,
 * 25-sep-2026: las horas de CADA línea se reparten entre los miembros
 * atribuidos, en vez de ir todas a un único Cuadro — una misma persona
 * puede generar varios RegistroNomina el mismo reporte, uno por Cuadro).
 */
async function crearLineasYNomina(
  tx: TransactionClient,
  realizadaId: string,
  huertaId: string,
  fechaReal: string,
  hectareasReporte: number,
  lineas: LineaRealizadaInput[],
  reparto: ReturnType<typeof calcularRepartoAvance<string>>,
  actividadId: string,
  tarifaAplicada: number,
  registradoPorId: string
) {
  const fecha = new Date(fechaReal);

  for (const linea of lineas) {
    const lineaCreada = await tx.aplicacionRealizadaLinea.create({
      data: {
        realizadaId,
        modalidad: linea.modalidad,
        tractorId: linea.tractorId,
        operadorId: linea.operadorId,
        implementoId: linea.implementoId,
        horas: linea.horas,
        personas: { create: linea.personalIds.map((personalId) => ({ personalId })) },
      },
    });

    const horasPorMiembro = repartirMontoPorHectareas(reparto.porMiembro, hectareasReporte, linea.horas);
    for (const personalId of personasAPagarDeLinea(linea)) {
      for (const hm of horasPorMiembro) {
        if (hm.monto <= 0.0001) continue;
        const { cuadroId } = parseClaveMiembro(hm.clave);
        await tx.registroNomina.create({
          data: {
            fecha,
            huertaId,
            cuadroId,
            personalId,
            actividadId,
            cantidad: hm.monto,
            tarifaAplicada,
            origen: "automatico_aplicacion",
            referenciaOrigenId: realizadaId,
            capturadoPorId: registradoPorId,
          },
        });
      }
    }

    if (linea.modalidad !== "mochila") {
      await registrarUsoDiarioAutomaticoTx(tx, linea.tractorId!, fecha, linea.operadorId!, linea.horas, huertaId, lineaCreada.id);
    }
  }
}

export interface EditarRealizadaInput {
  hectareas: number;
  lineas: LineaRealizadaInput[];
  comentario?: string;
}

/**
 * Historial de reportes editable por separado (9.7, V1 P2 25-sep-2026) —
 * sujeto al candado de consistencia con Nómina y al mismo candado de
 * superficie total. El Almacén Local se ajusta por la diferencia entre el
 * reparto de antes y el de ahora (por Grupo), nunca se vuelve a descontar
 * el total completo. Líneas, mano de obra automática, Uso Diario y el
 * reparto guardado se reemplazan completos (borrar y recrear).
 */
export async function editarRealizada(realizadaId: string, input: EditarRealizadaInput, editadoPorId: string) {
  validarLineas(input.lineas);
  if (!input.hectareas || input.hectareas <= 0) throw new Error("Captura las hectáreas avanzadas en este reporte.");

  const realizada = await prisma.aplicacionRealizada.findUniqueOrThrow({
    where: { id: realizadaId },
    include: { aplicacion: { include: { grupos: { include: INCLUDE_GRUPO }, realizadas: { select: { id: true, hectareas: true } } } }, lineas: true },
  });
  const fechaISO = realizada.fechaReal.toISOString().slice(0, 10);
  if (await diaEstaCerrado(realizada.aplicacion.huertaId, fechaISO)) throw new DiaCerradoAplicacionError();

  const aplicacion = realizada.aplicacion;
  const yaReportadasOtros = aplicacion.realizadas.filter((r) => r.id !== realizadaId).reduce((s, r) => s + Number(r.hectareas), 0);
  const totalConEste = yaReportadasOtros + input.hectareas;
  if (totalConEste > Number(aplicacion.hectareasTotalesProgramadas) + 0.0001) {
    throw new SuperficieExcedeProgramadoError(Number(aplicacion.hectareasTotalesProgramadas), totalConEste);
  }

  const actividad = await prisma.actividad.findFirstOrThrow({ where: { nombre: NOMBRE_ACTIVIDAD_APLICACION } });
  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
  const lineaIdsAnteriores = realizada.lineas.map((l) => l.id);

  const repartoAntes = calcularRepartoAvance(gruposParaReparto(aplicacion.grupos), Number(realizada.hectareas));
  const repartoDespues = calcularRepartoAvance(gruposParaReparto(aplicacion.grupos), input.hectareas);

  return prisma.$transaction(async (tx) => {
    const gruposRealizadaViejos = await tx.aplicacionRealizadaGrupo.findMany({ where: { realizadaId }, select: { id: true } });
    await tx.aplicacionRealizadaGrupoCuadro.deleteMany({ where: { realizadaGrupoId: { in: gruposRealizadaViejos.map((g) => g.id) } } });
    await tx.aplicacionRealizadaGrupo.deleteMany({ where: { realizadaId } });

    for (const pg of repartoDespues.porGrupo) {
      const rg = await tx.aplicacionRealizadaGrupo.create({
        data: { realizadaId, grupoId: pg.grupoId, hectareasAtribuidas: pg.hectareasAtribuidas },
      });
      for (const m of repartoDespues.porMiembro.filter((x) => x.grupoId === pg.grupoId)) {
        const { cuadroId, variedad } = parseClaveMiembro(m.clave);
        await tx.aplicacionRealizadaGrupoCuadro.create({
          data: { realizadaGrupoId: rg.id, cuadroId, variedad, hectareasAtribuidas: m.hectareasAtribuidas },
        });
      }
    }

    await tx.aplicacionRealizada.update({ where: { id: realizadaId }, data: { comentario: input.comentario, hectareas: input.hectareas } });

    await borrarUsoDiarioDeLineasTx(tx, lineaIdsAnteriores);
    await tx.registroNomina.deleteMany({ where: { origen: "automatico_aplicacion", referenciaOrigenId: realizadaId } });
    await tx.aplicacionRealizadaLineaPersona.deleteMany({ where: { lineaId: { in: lineaIdsAnteriores } } });
    await tx.aplicacionRealizadaLinea.deleteMany({ where: { realizadaId } });

    await crearLineasYNomina(tx, realizadaId, aplicacion.huertaId, fechaISO, input.hectareas, input.lineas, repartoDespues, actividad.id, tarifaAplicada, editadoPorId);

    for (const grupo of aplicacion.grupos) {
      const atribuidoAntes = repartoAntes.porGrupo.find((pg) => pg.grupoId === grupo.id)?.hectareasAtribuidas ?? 0;
      const atribuidoDespues = repartoDespues.porGrupo.find((pg) => pg.grupoId === grupo.id)?.hectareasAtribuidas ?? 0;
      for (const p of grupo.productos) {
        const cantidadAntes = proporcionDelGrupo(atribuidoAntes, Number(grupo.hectareasProgramadas), Number(p.cantidadTotalCalculada));
        const cantidadDespues = proporcionDelGrupo(atribuidoDespues, Number(grupo.hectareasProgramadas), Number(p.cantidadTotalCalculada));
        const delta = cantidadDespues - cantidadAntes;
        if (Math.abs(delta) <= 0.0000001) continue;

        const local = await tx.almacenLocal.upsert({
          where: { huertaId_productoId: { huertaId: aplicacion.huertaId, productoId: p.productoId } },
          update: { cantidadReportadaAcumulada: { increment: delta } },
          create: { huertaId: aplicacion.huertaId, productoId: p.productoId, cantidadReportadaAcumulada: delta },
        });
        await tx.almacenLocalMovimiento.create({
          data: { almacenLocalId: local.id, tipo: "ajuste_manual", cantidad: delta, referenciaId: aplicacion.id, capturadoPorId: editadoPorId },
        });
      }
    }

    return tx.aplicacionRealizada.findUniqueOrThrow({
      where: { id: realizadaId },
      include: { grupos: { include: { cuadros: { include: { cuadro: true } } } }, lineas: { include: INCLUDE_LINEA } },
    });
  });
}

/**
 * Cierra una aplicación programada que nunca se entregó — ya sea porque
 * pasaron los 15 días de vencimiento (9.7) o por cancelación manual de
 * Dirección/Gerencia Técnica. Libera el stock comprometido de cada
 * producto que sí llegó a apartarse. Solo aplica al caso "nunca salió de
 * bodega" — si ya se entregó al rancho, ver `cancelarAplicacionEntregada`.
 */
export async function liberarAplicacionVencida(aplicacionId: string, capturadoPorId: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId }, include: { productosDenormalizado: true } });
  if (aplicacion.estado !== "programada") throw new TransicionAplicacionInvalidaError("programada");

  const cantidadPorProducto = new Map<string, number>();
  for (const p of aplicacion.productosDenormalizado) {
    cantidadPorProducto.set(p.productoId, (cantidadPorProducto.get(p.productoId) ?? 0) + Number(p.cantidadTotalCalculada));
  }

  return prisma.$transaction(async (tx) => {
    for (const [productoId, cantidad] of cantidadPorProducto) {
      const comprometido = await tx.almacenCentralMovimiento.findFirst({
        where: { referenciaId: aplicacionId, tipo: "salida_comprometida", productoId },
      });
      if (comprometido) {
        await liberarComprometido(tx, productoId, cantidad, aplicacionId, capturadoPorId, "Liberación de aplicación vencida (15 días sin entregar) o cancelada manualmente.");
      }
    }
    // 1.5 (2-sep-2026): cualquier orden de compra ligada a esta Aplicación
    // que todavía no haya llegado a Almacén se cancela junto con ella —
    // ya no se puede pedir cotizar/comprar algo que ya no se necesita.
    await cancelarOrdenesDeReferencia(tx, aplicacionId);
    return tx.aplicacion.update({ where: { id: aplicacionId }, data: { estado: "vencida" } });
  });
}

/**
 * Protocolo de cancelación de aplicación entregada y vencida a 15 días
 * (9.7, reemplaza "Liberar" para este caso): el producto ya llegó al
 * rancho pero no se terminó de aplicar. Es el proceso inverso a la salida
 * de Almacén hacia el campo — revierte solo la porción NO aplicada
 * (proporcional a lo que sí quedó reportado como avance real), para CADA
 * producto de la Aplicación por separado (10-ago-2026, varios productos).
 * El ajuste de inventario ocurre de inmediato; la confirmación de Bodega es
 * un paso de registro aparte que no lo bloquea (ver `confirmarRecepcionCancelacion`).
 */
/**
 * Cierre por debajo de 100% (V1 P2, 25-sep-2026, regla): solo Dirección
 * General o Gerente Técnico (ya filtrado en la ruta) y con nota
 * obligatoria — se guarda en `Aplicacion.notaCierre`. Los 15 días cuentan
 * desde FECHA FIN de la programación (antes: fecha real de la entrega).
 */
export async function cancelarAplicacionEntregada(aplicacionId: string, canceladaPorId: string, nota: string) {
  if (!nota || !nota.trim()) throw new Error("El cierre por debajo de 100% necesita una nota obligatoria.");
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId }, include: { productosDenormalizado: true, realizadas: true } });
  if (aplicacion.estado !== "entregada" && aplicacion.estado !== "realizada") {
    throw new NoSePuedeCancelarError("Solo se puede cancelar una aplicación que ya fue entregada al rancho.");
  }

  const diasSinAplicar = Math.floor((Date.now() - aplicacion.fechaFin.getTime()) / 86_400_000);
  if (diasSinAplicar <= DIAS_VENCIMIENTO) {
    throw new NoSePuedeCancelarError(`Todavía no pasan los ${DIAS_VENCIMIENTO} días desde la fecha fin — lleva ${diasSinAplicar}.`);
  }

  const hectareasAvanzadas = aplicacion.realizadas.reduce((s, r) => s + Number(r.hectareas), 0);
  const porcentajeAvance = hectareasAvanzadas / Number(aplicacion.hectareasTotalesProgramadas);
  if (porcentajeAvance >= 0.9999) {
    throw new NoSePuedeCancelarError("Esta aplicación ya quedó completamente aplicada — no hay nada que cancelar.");
  }

  const cantidadPorProducto = new Map<string, number>();
  for (const p of aplicacion.productosDenormalizado) {
    cantidadPorProducto.set(p.productoId, (cantidadPorProducto.get(p.productoId) ?? 0) + Number(p.cantidadTotalCalculada));
  }

  return prisma.$transaction(async (tx) => {
    for (const [productoId, cantidadTotal] of cantidadPorProducto) {
      const cantidadARegresar = cantidadTotal * (1 - porcentajeAvance);

      const local = await tx.almacenLocal.update({
        where: { huertaId_productoId: { huertaId: aplicacion.huertaId, productoId } },
        data: { cantidadRecibidaAcumulada: { decrement: cantidadARegresar } },
      });
      await tx.almacenLocalMovimiento.create({
        data: {
          almacenLocalId: local.id,
          tipo: "ajuste_manual",
          cantidad: -cantidadARegresar,
          referenciaId: aplicacionId,
          capturadoPorId: canceladaPorId,
        },
      });

      // Regresa al/los lote(s) EXACTOS de donde salió, a su mismo precio
      // (regla f, V1 P1 25-sep-2026) — antes iba "al primer lote del
      // producto" sin importar cuál.
      const desglose = await desgloseLotesDeMovimientos(tx, aplicacionId, productoId, ["salida_real"]);
      const aplicado = await regresarProporcionalALotes(tx, desglose, cantidadARegresar);
      if (aplicado.length === 0) {
        const lote = await crearLoteRespaldo(tx, productoId, cantidadARegresar, "ABONO");
        await tx.almacenCentralMovimiento.create({
          data: {
            productoId,
            loteId: lote.id,
            tipo: "abono_sobrante",
            cantidad: cantidadARegresar,
            huertaDestinoId: aplicacion.huertaId,
            referenciaId: aplicacionId,
            capturadoPorId: canceladaPorId,
          },
        });
      } else {
        for (const parte of aplicado) {
          await tx.almacenCentralMovimiento.create({
            data: {
              productoId,
              loteId: parte.loteId,
              tipo: "abono_sobrante",
              cantidad: parte.cantidad,
              huertaDestinoId: aplicacion.huertaId,
              referenciaId: aplicacionId,
              capturadoPorId: canceladaPorId,
            },
          });
        }
      }
    }

    // 1.5 (2-sep-2026): en la práctica ya no debería haber nada pendiente
    // a estas alturas (el producto ya se recibió hace tiempo para poder
    // llegar a "entregada"), pero se llama igual por consistencia/defensa.
    await cancelarOrdenesDeReferencia(tx, aplicacionId);

    return tx.aplicacion.update({
      where: { id: aplicacionId },
      data: { estado: "cancelada", canceladaPorId, fechaCancelacion: new Date(), notaCierre: nota },
    });
  });
}

/** Firma digital de recepción del Encargado de Bodega (9.7) — confirma que el producto devuelto ya llegó físicamente. */
export async function confirmarRecepcionCancelacion(aplicacionId: string, confirmadoPorId: string) {
  const aplicacion = await prisma.aplicacion.findUniqueOrThrow({ where: { id: aplicacionId } });
  if (aplicacion.estado !== "cancelada") {
    throw new NoSePuedeCancelarError("Esta aplicación no está cancelada — no hay nada que confirmar.");
  }
  if (aplicacion.confirmacionBodegaPorId) {
    throw new NoSePuedeCancelarError("Ya se había confirmado la recepción de esta cancelación.");
  }
  return prisma.aplicacion.update({
    where: { id: aplicacionId },
    data: { confirmacionBodegaPorId: confirmadoPorId, fechaConfirmacionBodega: new Date() },
  });
}

/**
 * Cancelaciones entregadas y esperando la firma digital de recepción del
 * Encargado de Bodega (9.7). Vive aparte de `listarAplicaciones` porque
 * Bodega no tiene permiso sobre el módulo de Aplicaciones (ver matriz de
 * permisos, 9.7) — el módulo no le aparece en el menú (regla del bloque 4),
 * así que esta lista se expone bajo el permiso de Almacén en vez del de
 * Aplicaciones, para que sí le llegue el aviso de que se le va a regresar
 * producto. Con varios productos (10-ago-2026), el aviso lista cada uno con
 * su propia cantidad a regresar.
 */
export async function listarCancelacionesPendientesConfirmar() {
  const aplicaciones = await prisma.aplicacion.findMany({
    where: { estado: "cancelada", confirmacionBodegaPorId: null },
    include: { huerta: true, productosDenormalizado: { include: { producto: true } } },
    orderBy: { fechaCancelacion: "asc" },
  });
  // Aplanado uno por producto (corregido 15-ago-2026: esta función devolvía
  // `productos: [...]` agrupado, pero el tipo/pantalla del frontend siempre
  // esperó un renglón por producto — con más de un producto por cancelación
  // el acceso a `.producto.nombreComercial` habría tronado en tiempo real).
  const filas: {
    id: string;
    tipo: "cancelacion";
    origen: "aplicacion";
    huerta: { nombre: string };
    producto: { nombreComercial: string; unidad: string };
    cantidadRegresada: number;
    fecha: string | null;
  }[] = [];
  for (const a of aplicaciones) {
    const productosUnicos = [...new Map(a.productosDenormalizado.map((p) => [p.productoId, p])).values()];
    for (const p of productosUnicos) {
      // Suma, no findFirst (V1 P1, 25-sep-2026): una devolución puede
      // repartirse en varios movimientos, uno por lote de origen.
      const abonos = await prisma.almacenCentralMovimiento.findMany({
        where: { referenciaId: a.id, tipo: "abono_sobrante", productoId: p.productoId },
      });
      const cantidadRegresada = abonos.reduce((s, m) => s + Number(m.cantidad), 0);
      if (cantidadRegresada <= 0) continue;
      filas.push({
        id: a.id,
        tipo: "cancelacion",
        origen: "aplicacion",
        huerta: { nombre: a.huerta.nombre },
        producto: { nombreComercial: p.producto.nombreComercial, unidad: p.producto.unidad },
        cantidadRegresada,
        fecha: a.fechaCancelacion ? a.fechaCancelacion.toISOString() : null,
      });
    }
  }
  return filas;
}

// listarAjustesPendientesConfirmar y confirmarRecepcionAjuste (15-ago-2026)
// viven en almacen/movimientos.ts — son genéricas por movimiento, no
// dependen de si el origen fue una Aplicación o una Fertilización Granular.

/** Ingredientes Activos de todo producto autorizado cuya Categoría requiere Ingrediente Activo (no solo agroquímicos) — lo elegible al programar (9.7, ampliado 20-sep-2026). */
export async function productosParaAplicacion() {
  return ingredientesAutorizados(await nombresCategoriasConIngredienteActivo());
}

/** Implementos elegibles en una línea de Turbina/Aguilón (9.7/9.13). */
export function equiposImplementoParaAplicacion() {
  return listarEquipos("implemento");
}

/** Tractores elegibles en una línea de Turbina/Aguilón (9.7/9.13). */
export function equiposTractorParaAplicacion() {
  return listarEquipos("tractor");
}
