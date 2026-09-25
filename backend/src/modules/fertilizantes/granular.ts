import {
  calcularCantidadTotalGranular,
  calcularRepartoAvance,
  ordenarPorNombreNumerico,
  plantasTotalesCuadro,
  proporcionDelGrupo,
  repartirMontoPorHectareas,
  tarifaEfectiva,
  type GrupoPrograma,
  type ModoDosisGranular,
} from "@cbf/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../core/db.js";
import type { TransactionClient } from "../../core/db.js";
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
import { ingredientesAutorizados, resolverProductoPreferidoPorNombre } from "../almacen/preferencias.js";
import { categoriaEsFertilizante, nombresCategoriasFertilizante } from "../almacen/productos.js";
import { obtenerVersionVigente } from "../unidades-produccion/cuadros.js";
import { obtenerConfigNomina } from "../nomina/config.js";
import { aActividadCalc } from "../nomina/util.js";
import { diaEstaCerrado } from "../nomina/captura.js";
import { cancelarOrdenesDeReferencia } from "../compras/ordenes.js";

// Actividad de Nómina para la mano de obra automática de Fertilización
// Granular (9.5/9.11) — decisión explícita del usuario: ninguna de las 12
// actividades confirmadas originalmente representaba esto, se agregó
// "Fertilización" al catálogo con el mismo esquema que las demás.
const NOMBRE_ACTIVIDAD_GRANULAR = "Fertilización";
const DIAS_VENCIMIENTO = 15;

export class ProductoNoAutorizadoFertilizanteError extends Error {
  constructor() {
    super("Uno de los productos elegidos no es un fertilizante autorizado — no se puede programar una fertilización con él.");
  }
}

export class TransicionFertilizacionInvalidaError extends Error {
  constructor(esperado: string) {
    super(`Esta fertilización no está en estado "${esperado}".`);
  }
}

export class StockNoComprometidoError extends Error {
  constructor() {
    super("Todavía no hay suficiente stock apartado para todos los productos de esta fertilización — espera a que llegue la compra automática.");
  }
}

export class SuperficieExcedeProgramadoError extends Error {
  constructor(hectareasProgramadas: number, hectareasAcumuladas: number) {
    super(
      `Esta Fertilización tiene ${hectareasProgramadas} ha programadas, pero entre todos los reportes se acumularían ${hectareasAcumuladas.toFixed(4)} ha — la suma no puede exceder lo programado.`
    );
  }
}

export class DiaCerradoFertilizacionError extends Error {
  constructor() {
    super("La Huerta ya tiene cerrado el día de Nómina de este reporte — no se puede editar (candado de consistencia con Nómina).");
  }
}

export class NoSePuedeCancelarError extends Error {
  constructor(motivo: string) {
    super(motivo);
  }
}

export class DiaCerradoRequiereCasoExtraordinarioError extends Error {
  constructor() {
    super(
      "La Huerta ya tiene cerrado el día de Nómina de esta fecha — para que este registro cuente, se necesita autorización de caso extraordinario (Encargado de Nóminas, Director General o Gerente Administrativo)."
    );
  }
}

export type ModoProgramacionCuadro = "por_cuadro" | "por_variedad";

// Ingrediente Activo, nunca marca (Prioridad 1, 3-sep-2026) — Programar ya
// no captura productoId directamente, se resuelve al Producto preferido.
export interface ProductoGranularInput {
  ingredienteActivoNombre: string;
  modoDosis: ModoDosisGranular;
  dosisValor: number;
}

interface ProductoGranularResuelto extends ProductoGranularInput {
  productoId: string;
}

async function resolverIngredientesGranular(productos: ProductoGranularInput[]): Promise<ProductoGranularResuelto[]> {
  return Promise.all(productos.map(async (p) => ({ ...p, productoId: await resolverProductoPreferidoPorNombre(p.ingredienteActivoNombre) })));
}

export interface GrupoCuadroInput {
  cuadroId: string;
  hectareas: number;
}

export interface GrupoVariedadInput {
  cuadroId: string;
  variedad: string;
}

export interface GrupoGranularInput {
  cuadros?: GrupoCuadroInput[];
  variedades?: GrupoVariedadInput[];
  productos: ProductoGranularInput[];
}

export interface ProgramarGranularInput {
  huertaId: string;
  modo: ModoProgramacionCuadro;
  grupos: GrupoGranularInput[];
  recursoTipo: "gente" | "implemento";
  equipoId?: string;
  fechaInicio: string;
  fechaFin: string;
  comentario?: string;
}

/** Codifica un miembro de Grupo como clave única — Cuadro solo, o Cuadro+Variedad. */
function claveMiembro(cuadroId: string, variedad: string | null): string {
  return variedad ? `${cuadroId}::${variedad}` : cuadroId;
}
function parseClaveMiembro(clave: string): { cuadroId: string; variedad: string | null } {
  const idx = clave.indexOf("::");
  return idx === -1 ? { cuadroId: clave, variedad: null } : { cuadroId: clave.slice(0, idx), variedad: clave.slice(idx + 2) };
}

/** Hectáreas de una variedad en un Cuadro según la composición varietal vigente del Ciclo. */
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

interface MiembroResuelto {
  cuadroId: string;
  variedad: string | null;
  hectareas: number;
  plantas: number;
}

/** Resuelve los miembros (Cuadro o Cuadro+Variedad) de un Grupo con sus hectáreas y plantas (para dosis g/planta). */
async function resolverMiembrosGrupo(
  huertaId: string,
  modo: ModoProgramacionCuadro,
  grupo: GrupoGranularInput,
  fechaRef: Date,
  requierePlantas: boolean
): Promise<{ hectareasProgramadas: number; plantasProgramadas: number; miembros: MiembroResuelto[] }> {
  const miembros: MiembroResuelto[] = [];

  if (modo === "por_cuadro") {
    if (!grupo.cuadros || grupo.cuadros.length === 0) throw new Error("Cada Grupo necesita al menos un Cuadro.");
    for (const c of grupo.cuadros) {
      const version = await obtenerVersionVigente(c.cuadroId, fechaRef);
      if (!version) throw new Error("Uno de los Cuadros elegidos no tiene una configuración vigente para la fecha de inicio.");
      if (c.hectareas <= 0 || c.hectareas > Number(version.hectareas) + 0.0001) {
        throw new Error(`Hectáreas inválidas para uno de los Cuadros: no pueden ser 0 ni exceder su superficie (${version.hectareas} ha).`);
      }
      let plantas = 0;
      if (requierePlantas) {
        if (!version.distSurcosM || !version.distPlantasM) throw new Error("Uno de los Cuadros elegidos no tiene Marco de Plantación configurado — no se puede calcular g/planta.");
        plantas = plantasTotalesCuadro(c.hectareas, Number(version.distSurcosM), Number(version.distPlantasM));
      }
      miembros.push({ cuadroId: c.cuadroId, variedad: null, hectareas: c.hectareas, plantas });
    }
  } else {
    if (!grupo.variedades || grupo.variedades.length === 0) throw new Error("Cada Grupo necesita al menos una Variedad.");
    for (const v of grupo.variedades) {
      const hectareas = await hectareasDeVariedad(huertaId, v.cuadroId, v.variedad, fechaRef);
      let plantas = 0;
      if (requierePlantas) {
        const version = await obtenerVersionVigente(v.cuadroId, fechaRef);
        if (!version?.distSurcosM || !version?.distPlantasM) throw new Error("Uno de los Cuadros elegidos no tiene Marco de Plantación configurado — no se puede calcular g/planta.");
        plantas = plantasTotalesCuadro(hectareas, Number(version.distSurcosM), Number(version.distPlantasM));
      }
      miembros.push({ cuadroId: v.cuadroId, variedad: v.variedad, hectareas, plantas });
    }
  }

  return {
    hectareasProgramadas: miembros.reduce((s, m) => s + m.hectareas, 0),
    plantasProgramadas: miembros.reduce((s, m) => s + m.plantas, 0),
    miembros,
  };
}

interface FertGrupoParaReparto {
  id: string;
  hectareasProgramadas: Prisma.Decimal;
  cuadros: { cuadroId: string; hectareas: Prisma.Decimal }[];
  variedades: { cuadroId: string; variedad: string; hectareas: Prisma.Decimal }[];
}

function gruposParaReparto(grupos: FertGrupoParaReparto[]): GrupoPrograma<string>[] {
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
 * Paso 1, Programar — Camino 1 Granular (9.5, V1 P2 25-sep-2026: Grupos +
 * modo Por Cuadro/Por Variedad, mismo modelo que Aplicaciones salvo que
 * aquí no hay "litros de mezcla" compartido — cada producto de cada Grupo
 * conserva su propia dosis (kg/ha o g/planta), independiente. kg/ha usa
 * las hectáreas del Grupo; g/planta usa las plantas del Grupo (Marco de
 * Plantación de sus Cuadros). Cada producto aparta stock de inmediato si
 * alcanza; si no, genera automático una orden de Compras por el faltante
 * — agregado por producto ÚNICO a través de todos los Grupos.
 */
export async function programarGranular(input: ProgramarGranularInput, creadoPorId: string) {
  if (input.recursoTipo === "implemento" && !input.equipoId) {
    throw new Error("Falta el equipo — el recurso 'Con implemento' requiere elegir un equipo.");
  }
  if (!input.grupos || input.grupos.length === 0) throw new Error("Falta al menos un Grupo (si no armas Grupos, se programa como uno solo con todo).");

  const fechaRef = new Date(input.fechaInicio);
  const gruposResueltos = await Promise.all(
    input.grupos.map(async (g) => {
      if (!g.productos || g.productos.length === 0) throw new Error("Cada Grupo necesita al menos un producto.");
      const requierePlantas = g.productos.some((p) => p.modoDosis === "g_planta");
      const miembros = await resolverMiembrosGrupo(input.huertaId, input.modo, g, fechaRef, requierePlantas);
      const productosResueltos = await resolverIngredientesGranular(g.productos);
      const productos = await prisma.producto.findMany({ where: { id: { in: productosResueltos.map((p) => p.productoId) } } });
      for (const p of productos) {
        if (!(await categoriaEsFertilizante(p.categoria)) || !p.autorizado) throw new ProductoNoAutorizadoFertilizanteError();
      }
      return { input: g, miembros, productosResueltos };
    })
  );

  const hectareasTotales = gruposResueltos.reduce((s, g) => s + g.miembros.hectareasProgramadas, 0);

  return prisma.$transaction(async (tx) => {
    const fertilizacion = await tx.fertilizacionGranular.create({
      data: {
        huertaId: input.huertaId,
        modo: input.modo,
        recursoTipo: input.recursoTipo,
        equipoId: input.recursoTipo === "implemento" ? input.equipoId : undefined,
        comentario: input.comentario,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        hectareasTotalesProgramadas: hectareasTotales,
        creadoPorId,
      },
    });

    for (let i = 0; i < gruposResueltos.length; i++) {
      const g = gruposResueltos[i]!;
      const grupo = await tx.fertilizacionGranularGrupo.create({
        data: {
          fertilizacionId: fertilizacion.id,
          orden: i + 1,
          hectareasProgramadas: g.miembros.hectareasProgramadas,
          plantasProgramadas: g.miembros.plantasProgramadas > 0 ? g.miembros.plantasProgramadas : undefined,
        },
      });
      if (input.modo === "por_cuadro") {
        await tx.fertilizacionGranularGrupoCuadro.createMany({
          data: g.miembros.miembros.map((m) => ({ grupoId: grupo.id, cuadroId: m.cuadroId, hectareas: m.hectareas })),
        });
      } else {
        await tx.fertilizacionGranularGrupoVariedad.createMany({
          data: g.miembros.miembros.map((m) => ({ grupoId: grupo.id, cuadroId: m.cuadroId, variedad: m.variedad!, hectareas: m.hectareas })),
        });
      }

      for (const p of g.productosResueltos) {
        const cantidadTotalCalculada = calcularCantidadTotalGranular(p.modoDosis, p.dosisValor, g.miembros.hectareasProgramadas, g.miembros.plantasProgramadas);
        await tx.fertilizacionGranularProducto.create({
          data: {
            grupoId: grupo.id,
            fertilizacionId: fertilizacion.id,
            productoId: p.productoId,
            modoDosis: p.modoDosis,
            dosisValor: p.dosisValor,
            cantidadTotalCalculada,
          },
        });
      }
    }

    // Comprometer/comprar por producto ÚNICO, sumado a través de todos los Grupos.
    const cantidadTotalPorProducto = new Map<string, number>();
    for (const g of gruposResueltos) {
      for (const p of g.productosResueltos) {
        const cantidad = calcularCantidadTotalGranular(p.modoDosis, p.dosisValor, g.miembros.hectareasProgramadas, g.miembros.plantasProgramadas);
        cantidadTotalPorProducto.set(p.productoId, (cantidadTotalPorProducto.get(p.productoId) ?? 0) + cantidad);
      }
    }
    for (const [productoId, cantidadTotalCalculada] of cantidadTotalPorProducto) {
      const comprometido = await intentarComprometer(tx, productoId, cantidadTotalCalculada, fertilizacion.id, creadoPorId);
      if (!comprometido) {
        const disponible = await stockTotalProductoTx(tx, productoId);
        const faltante = cantidadTotalCalculada - disponible;
        await tx.ordenCompra.create({
          data: {
            origen: "automatica",
            productoId,
            cantidadSolicitada: faltante,
            estado: "pendiente_cotizar",
            referenciaAplicacionId: fertilizacion.id,
            creadoPorId,
          },
        });
      }
    }
    return fertilizacion;
  });
}

export class YaHayAvanceReportadoGranularError extends Error {
  constructor() {
    super("Esta Fertilización ya tiene reportes de avance — no se puede editar la dosis, cancélala y reprograma con los datos correctos.");
  }
}

/**
 * Editar el Paso 1 ya programado/entregado (9.5, V1 P2 25-sep-2026: sobre
 * Grupos) — permitido mientras no exista ningún reporte de avance todavía.
 * Se borran y recrean todos los Grupos/miembros/productos; el ajuste de
 * Almacén se calcula agregando por productoId a través de todos los Grupos.
 */
export async function editarGranularProgramada(id: string, input: Omit<ProgramarGranularInput, "huertaId">, editadoPorId: string) {
  if (input.recursoTipo === "implemento" && !input.equipoId) {
    throw new Error("Falta el equipo — el recurso 'Con implemento' requiere elegir un equipo.");
  }
  if (!input.grupos || input.grupos.length === 0) throw new Error("Falta al menos un Grupo.");

  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({
    where: { id },
    include: { productosDenormalizado: true, realizadas: true },
  });
  if (fertilizacion.estado !== "programada" && fertilizacion.estado !== "entregada") {
    throw new TransicionFertilizacionInvalidaError("programada o entregada");
  }
  if (fertilizacion.realizadas.length > 0) throw new YaHayAvanceReportadoGranularError();

  const fechaRef = new Date(input.fechaInicio);
  const gruposResueltos = await Promise.all(
    input.grupos.map(async (g) => {
      if (!g.productos || g.productos.length === 0) throw new Error("Cada Grupo necesita al menos un producto.");
      const requierePlantas = g.productos.some((p) => p.modoDosis === "g_planta");
      const miembros = await resolverMiembrosGrupo(fertilizacion.huertaId, input.modo, g, fechaRef, requierePlantas);
      const productosResueltos = await resolverIngredientesGranular(g.productos);
      const productosNuevos = await prisma.producto.findMany({ where: { id: { in: productosResueltos.map((p) => p.productoId) } } });
      for (const p of productosNuevos) {
        if (!(await categoriaEsFertilizante(p.categoria)) || !p.autorizado) throw new ProductoNoAutorizadoFertilizanteError();
      }
      return { input: g, miembros, productosResueltos };
    })
  );

  const hectareasTotales = gruposResueltos.reduce((s, g) => s + g.miembros.hectareasProgramadas, 0);
  const entregada = fertilizacion.estado === "entregada";

  const cantidadAnteriorPorProducto = new Map<string, number>();
  for (const p of fertilizacion.productosDenormalizado) {
    cantidadAnteriorPorProducto.set(p.productoId, (cantidadAnteriorPorProducto.get(p.productoId) ?? 0) + Number(p.cantidadTotalCalculada));
  }
  const cantidadNuevaPorProducto = new Map<string, number>();
  for (const g of gruposResueltos) {
    for (const p of g.productosResueltos) {
      const cantidad = calcularCantidadTotalGranular(p.modoDosis, p.dosisValor, g.miembros.hectareasProgramadas, g.miembros.plantasProgramadas);
      cantidadNuevaPorProducto.set(p.productoId, (cantidadNuevaPorProducto.get(p.productoId) ?? 0) + cantidad);
    }
  }
  const productoIdsTocados = new Set([...cantidadAnteriorPorProducto.keys(), ...cantidadNuevaPorProducto.keys()]);

  return prisma.$transaction(async (tx) => {
    for (const productoId of productoIdsTocados) {
      const anterior = cantidadAnteriorPorProducto.get(productoId) ?? 0;
      const nueva = cantidadNuevaPorProducto.get(productoId) ?? 0;
      await ajustarCantidadProducto(tx, fertilizacion.huertaId, id, productoId, anterior, nueva, entregada, editadoPorId);
    }

    const gruposViejos = await tx.fertilizacionGranularGrupo.findMany({ where: { fertilizacionId: id }, select: { id: true } });
    const grupoIdsViejos = gruposViejos.map((g) => g.id);
    await tx.fertilizacionGranularProducto.deleteMany({ where: { fertilizacionId: id } });
    await tx.fertilizacionGranularGrupoCuadro.deleteMany({ where: { grupoId: { in: grupoIdsViejos } } });
    await tx.fertilizacionGranularGrupoVariedad.deleteMany({ where: { grupoId: { in: grupoIdsViejos } } });
    await tx.fertilizacionGranularGrupo.deleteMany({ where: { fertilizacionId: id } });

    for (let i = 0; i < gruposResueltos.length; i++) {
      const g = gruposResueltos[i]!;
      const grupo = await tx.fertilizacionGranularGrupo.create({
        data: {
          fertilizacionId: id,
          orden: i + 1,
          hectareasProgramadas: g.miembros.hectareasProgramadas,
          plantasProgramadas: g.miembros.plantasProgramadas > 0 ? g.miembros.plantasProgramadas : undefined,
        },
      });
      if (input.modo === "por_cuadro") {
        await tx.fertilizacionGranularGrupoCuadro.createMany({
          data: g.miembros.miembros.map((m) => ({ grupoId: grupo.id, cuadroId: m.cuadroId, hectareas: m.hectareas })),
        });
      } else {
        await tx.fertilizacionGranularGrupoVariedad.createMany({
          data: g.miembros.miembros.map((m) => ({ grupoId: grupo.id, cuadroId: m.cuadroId, variedad: m.variedad!, hectareas: m.hectareas })),
        });
      }
      for (const p of g.productosResueltos) {
        const cantidadTotalCalculada = calcularCantidadTotalGranular(p.modoDosis, p.dosisValor, g.miembros.hectareasProgramadas, g.miembros.plantasProgramadas);
        await tx.fertilizacionGranularProducto.create({
          data: { grupoId: grupo.id, fertilizacionId: id, productoId: p.productoId, modoDosis: p.modoDosis, dosisValor: p.dosisValor, cantidadTotalCalculada },
        });
      }
    }

    return tx.fertilizacionGranular.update({
      where: { id },
      data: {
        modo: input.modo,
        recursoTipo: input.recursoTipo,
        equipoId: input.recursoTipo === "implemento" ? input.equipoId : null,
        comentario: input.comentario,
        fechaInicio: fechaRef,
        fechaFin: new Date(input.fechaFin),
        hectareasTotalesProgramadas: hectareasTotales,
      },
    });
  });
}

const INCLUDE_GRUPO = {
  cuadros: { include: { cuadro: true } },
  variedades: { include: { cuadro: true } },
  productos: { include: { producto: true } },
};

const INCLUDE_GRANULAR = {
  huerta: true,
  equipo: true,
  grupos: { include: INCLUDE_GRUPO, orderBy: { orden: "asc" as const } },
  realizadas: {
    include: { grupos: { include: { cuadros: { include: { cuadro: true } } } } },
    orderBy: { fechaReal: "desc" as const },
  },
};

function ordenarCuadrosDe<T extends { grupos: { cuadros: { cuadro: { nombre: string } }[] }[] }>(item: T): T {
  for (const g of item.grupos) g.cuadros = ordenarPorNombreNumerico(g.cuadros, (c) => c.cuadro.nombre);
  return item;
}

type GrupoConRealizadas = {
  id: string;
  hectareasProgramadas: Prisma.Decimal;
  cuadros: { cuadroId: string; hectareas: Prisma.Decimal; cuadro: { nombre: string } }[];
  variedades: { cuadroId: string; variedad: string; hectareas: Prisma.Decimal }[];
  productos: { productoId: string; cantidadTotalCalculada: Prisma.Decimal }[];
};

type GranularConRealizadas = {
  id: string;
  estado: string;
  fechaInicio: Date;
  fechaFin: Date;
  hectareasTotalesProgramadas: Prisma.Decimal;
  grupos: GrupoConRealizadas[];
  realizadas: { id: string; hectareas: Prisma.Decimal; horas: Prisma.Decimal; grupos: { grupoId: string; hectareasAtribuidas: Prisma.Decimal; cuadros: { cuadroId: string; variedad: string | null; hectareasAtribuidas: Prisma.Decimal }[] }[] }[];
};

/** Hectáreas restantes por miembro (Cuadro/Variedad) — mismo criterio que Aplicaciones. */
function hectareasRestantesPorMiembro(fertilizacion: GranularConRealizadas, excluirRealizadaId?: string): Record<string, number> {
  const programadoPorClave = new Map<string, number>();
  for (const g of fertilizacion.grupos) {
    if (g.cuadros.length > 0) {
      for (const c of g.cuadros) programadoPorClave.set(claveMiembro(c.cuadroId, null), (programadoPorClave.get(claveMiembro(c.cuadroId, null)) ?? 0) + Number(c.hectareas));
    } else {
      for (const v of g.variedades) programadoPorClave.set(claveMiembro(v.cuadroId, v.variedad), (programadoPorClave.get(claveMiembro(v.cuadroId, v.variedad)) ?? 0) + Number(v.hectareas));
    }
  }
  const reportadoPorClave = new Map<string, number>();
  for (const r of fertilizacion.realizadas) {
    if (r.id === excluirRealizadaId) continue;
    for (const rg of r.grupos) {
      for (const rc of rg.cuadros) {
        const clave = claveMiembro(rc.cuadroId, rc.variedad);
        reportadoPorClave.set(clave, (reportadoPorClave.get(clave) ?? 0) + Number(rc.hectareasAtribuidas));
      }
    }
  }
  const restantes: Record<string, number> = {};
  for (const [clave, total] of programadoPorClave) restantes[clave] = Math.max(0, total - (reportadoPorClave.get(clave) ?? 0));
  return restantes;
}

async function enriquecerConAlertas<T extends GranularConRealizadas>(fertilizacion: T) {
  const productos = fertilizacion.grupos.flatMap((g) => g.productos);
  const movimientosComprometido = await prisma.almacenCentralMovimiento.findMany({
    where: { referenciaId: fertilizacion.id, tipo: "salida_comprometida" },
  });
  const movimientosEntrega = await prisma.almacenCentralMovimiento.findMany({
    where: { referenciaId: fertilizacion.id, tipo: "salida_real" },
  });
  const comprometido = productos.every((p) => movimientosComprometido.some((m) => m.productoId === p.productoId));
  const entrega = movimientosEntrega[0];
  void entrega;

  // Plazos (V1 P2, 25-sep-2026): igual que Aplicaciones — desde fechaInicio/fechaFin.
  const diasSinEntregar = fertilizacion.estado === "programada" ? Math.floor((Date.now() - fertilizacion.fechaInicio.getTime()) / 86_400_000) : null;
  const diasSinAplicar =
    fertilizacion.estado === "entregada" || fertilizacion.estado === "realizada" ? Math.floor((Date.now() - fertilizacion.fechaFin.getTime()) / 86_400_000) : null;

  const hectareasAvanzadas = fertilizacion.realizadas.reduce((s, r) => s + Number(r.hectareas), 0);
  const horasHombreTotales = fertilizacion.realizadas.reduce((s, r) => s + Number(r.horas), 0);
  const porcentajeAvance = Number(fertilizacion.hectareasTotalesProgramadas) > 0 ? (hectareasAvanzadas / Number(fertilizacion.hectareasTotalesProgramadas)) * 100 : 0;
  const restantesPorMiembro = hectareasRestantesPorMiembro(fertilizacion);

  return {
    ...fertilizacion,
    comprometido,
    diasSinEntregar,
    alertaVencimiento: (diasSinEntregar ?? 0) > DIAS_VENCIMIENTO,
    diasSinAplicar,
    alertaPendienteAplicar: (diasSinAplicar ?? 0) > DIAS_VENCIMIENTO && porcentajeAvance < 100,
    hectareasAvanzadas,
    horasHombreTotales,
    porcentajeAvance,
    restantesPorMiembro,
  };
}

export async function listarGranular(huertaId?: string, incluirCerradas?: boolean) {
  const fertilizaciones = await prisma.fertilizacionGranular.findMany({
    where: { huertaId, ...(incluirCerradas ? {} : { estado: { notIn: ["vencida", "cancelada"] } }) },
    include: INCLUDE_GRANULAR,
    orderBy: { fechaCreacion: "desc" },
  });
  fertilizaciones.forEach(ordenarCuadrosDe);
  return Promise.all(fertilizaciones.map((f) => enriquecerConAlertas(f)));
}

export async function obtenerGranular(id: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id }, include: INCLUDE_GRANULAR });
  ordenarCuadrosDe(fertilizacion);
  return enriquecerConAlertas(fertilizacion);
}

/** Confirma la entrega física de TODOS los productos — acción de Almacén (Bodega), no de quien programó. */
export async function confirmarEntregaGranular(id: string, capturadoPorId: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id }, include: { productosDenormalizado: true } });
  if (fertilizacion.estado !== "programada") throw new TransicionFertilizacionInvalidaError("programada");

  const cantidadPorProducto = new Map<string, number>();
  for (const p of fertilizacion.productosDenormalizado) {
    cantidadPorProducto.set(p.productoId, (cantidadPorProducto.get(p.productoId) ?? 0) + Number(p.cantidadTotalCalculada));
  }

  return prisma.$transaction(async (tx) => {
    const comprometidos = await tx.almacenCentralMovimiento.findMany({ where: { referenciaId: id, tipo: "salida_comprometida" } });
    const faltaAlguno = [...cantidadPorProducto.keys()].some((productoId) => !comprometidos.some((m) => m.productoId === productoId));
    if (faltaAlguno) throw new StockNoComprometidoError();

    for (const [productoId, cantidad] of cantidadPorProducto) {
      await confirmarEntregaComprometida(tx, productoId, fertilizacion.huertaId, cantidad, id, capturadoPorId);
    }
    return tx.fertilizacionGranular.update({ where: { id }, data: { estado: "entregada" } });
  });
}

export interface RegistrarRealizadaGranularInput {
  personalId?: string;
  grupoPagoId?: string;
  horas: number;
  fechaReal: string;
  hectareas: number;
  casoExtraordinario?: boolean;
  comentario?: string;
}

/**
 * Descuenta el Almacén Local de cada producto de UN Grupo, proporcional a
 * lo atribuido a ESE Grupo en este reporte.
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

/** Crea el reparto de Nómina — una sola persona/Grupo de pago, sus horas repartidas por miembro (Cuadro/Variedad). */
async function crearNominaGranular(
  tx: TransactionClient,
  realizadaId: string,
  huertaId: string,
  fecha: Date,
  hectareasReporte: number,
  horas: number,
  personalId: string | undefined,
  grupoPagoId: string | undefined,
  reparto: ReturnType<typeof calcularRepartoAvance<string>>,
  actividadId: string,
  tarifaAplicada: number,
  registradoPorId: string
) {
  const horasPorMiembro = repartirMontoPorHectareas(reparto.porMiembro, hectareasReporte, horas);
  for (const hm of horasPorMiembro) {
    if (hm.monto <= 0.0001) continue;
    const { cuadroId } = parseClaveMiembro(hm.clave);
    await tx.registroNomina.create({
      data: {
        fecha,
        huertaId,
        cuadroId,
        personalId,
        grupoId: grupoPagoId,
        actividadId,
        cantidad: hm.monto,
        tarifaAplicada,
        origen: "automatico_fertilizacion",
        referenciaOrigenId: realizadaId,
        capturadoPorId: registradoPorId,
      },
    });
  }
}

/**
 * Paso 2, Registrar como realizada (V1 P2, 25-sep-2026): ya no indica
 * Cuadro/Variedad/Grupo — solo hectáreas totales del reporte. El sistema
 * reparte a Grupos y de ahí a Cuadros/Variedades en proporción a lo
 * programado, y GUARDA ese reparto (nunca se recalcula después).
 */
export async function registrarRealizadaGranular(id: string, input: RegistrarRealizadaGranularInput, registradoPorId: string) {
  if (!input.personalId && !input.grupoPagoId) throw new Error("Falta quién hizo la fertilización (persona o grupo).");
  if (!input.hectareas || input.hectareas <= 0) throw new Error("Captura las hectáreas avanzadas en este reporte.");

  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({
    where: { id },
    include: { grupos: { include: INCLUDE_GRUPO }, realizadas: { select: { hectareas: true } } },
  });
  if (fertilizacion.estado !== "entregada" && fertilizacion.estado !== "realizada") {
    throw new Error("No se ha entregado el producto a esta Huerta todavía — Almacén debe confirmar la entrega antes de registrar la fertilización como realizada.");
  }

  const yaReportadas = fertilizacion.realizadas.reduce((s, r) => s + Number(r.hectareas), 0);
  const totalConEste = yaReportadas + input.hectareas;
  if (totalConEste > Number(fertilizacion.hectareasTotalesProgramadas) + 0.0001) {
    throw new SuperficieExcedeProgramadoError(Number(fertilizacion.hectareasTotalesProgramadas), totalConEste);
  }

  if ((await diaEstaCerrado(fertilizacion.huertaId, input.fechaReal)) && !input.casoExtraordinario) {
    throw new DiaCerradoRequiereCasoExtraordinarioError();
  }

  const actividad = await prisma.actividad.findFirstOrThrow({ where: { nombre: NOMBRE_ACTIVIDAD_GRANULAR } });
  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);
  const esPrimeraVezRealizada = fertilizacion.estado === "entregada";

  const reparto = calcularRepartoAvance(gruposParaReparto(fertilizacion.grupos), input.hectareas);
  const fecha = new Date(input.fechaReal);

  return prisma.$transaction(async (tx) => {
    const realizada = await tx.fertilizacionGranularRealizada.create({
      data: {
        fertilizacionId: id,
        personalId: input.personalId,
        grupoPagoId: input.grupoPagoId,
        horas: input.horas,
        hectareas: input.hectareas,
        fechaReal: fecha,
        registradoPorId,
        comentario: input.comentario,
      },
    });

    for (const pg of reparto.porGrupo) {
      const rg = await tx.fertilizacionGranularRealizadaGrupo.create({
        data: { realizadaId: realizada.id, grupoId: pg.grupoId, hectareasAtribuidas: pg.hectareasAtribuidas },
      });
      for (const m of reparto.porMiembro.filter((x) => x.grupoId === pg.grupoId)) {
        const { cuadroId, variedad } = parseClaveMiembro(m.clave);
        await tx.fertilizacionGranularRealizadaGrupoCuadro.create({
          data: { realizadaGrupoId: rg.id, cuadroId, variedad, hectareasAtribuidas: m.hectareasAtribuidas },
        });
      }
    }

    await crearNominaGranular(tx, realizada.id, fertilizacion.huertaId, fecha, input.hectareas, input.horas, input.personalId, input.grupoPagoId, reparto, actividad.id, tarifaAplicada, registradoPorId);

    if (esPrimeraVezRealizada) {
      await tx.fertilizacionGranular.update({ where: { id }, data: { estado: "realizada" } });
    }

    for (const grupo of fertilizacion.grupos) {
      const atribuidoGrupo = reparto.porGrupo.find((pg) => pg.grupoId === grupo.id)?.hectareasAtribuidas ?? 0;
      await descontarAlmacenLocalPorGrupo(tx, fertilizacion.huertaId, grupo.productos, atribuidoGrupo, Number(grupo.hectareasProgramadas), realizada.id, registradoPorId);
    }

    return tx.fertilizacionGranularRealizada.findUniqueOrThrow({
      where: { id: realizada.id },
      include: { grupos: { include: { cuadros: { include: { cuadro: true } } } } },
    });
  });
}

export interface EditarRealizadaGranularInput {
  personalId?: string;
  grupoPagoId?: string;
  horas: number;
  hectareas: number;
  comentario?: string;
}

/** Historial de reportes editable por separado — mismo candado de consistencia con Nómina que Aplicaciones. */
export async function editarRealizadaGranular(realizadaId: string, input: EditarRealizadaGranularInput, editadoPorId: string) {
  if (!input.personalId && !input.grupoPagoId) throw new Error("Falta quién hizo la fertilización (persona o grupo).");
  if (!input.hectareas || input.hectareas <= 0) throw new Error("Captura las hectáreas avanzadas en este reporte.");

  const realizada = await prisma.fertilizacionGranularRealizada.findUniqueOrThrow({
    where: { id: realizadaId },
    include: { fertilizacion: { include: { grupos: { include: INCLUDE_GRUPO }, realizadas: { select: { id: true, hectareas: true } } } } },
  });
  const fechaISO = realizada.fechaReal.toISOString().slice(0, 10);
  if (await diaEstaCerrado(realizada.fertilizacion.huertaId, fechaISO)) throw new DiaCerradoFertilizacionError();

  const fertilizacion = realizada.fertilizacion;
  const yaReportadasOtros = fertilizacion.realizadas.filter((r) => r.id !== realizadaId).reduce((s, r) => s + Number(r.hectareas), 0);
  const totalConEste = yaReportadasOtros + input.hectareas;
  if (totalConEste > Number(fertilizacion.hectareasTotalesProgramadas) + 0.0001) {
    throw new SuperficieExcedeProgramadoError(Number(fertilizacion.hectareasTotalesProgramadas), totalConEste);
  }

  const actividad = await prisma.actividad.findFirstOrThrow({ where: { nombre: NOMBRE_ACTIVIDAD_GRANULAR } });
  const config = await obtenerConfigNomina();
  const tarifaAplicada = tarifaEfectiva(aActividadCalc(actividad), config.tarifaGeneralHora);

  const repartoAntes = calcularRepartoAvance(gruposParaReparto(fertilizacion.grupos), Number(realizada.hectareas));
  const repartoDespues = calcularRepartoAvance(gruposParaReparto(fertilizacion.grupos), input.hectareas);
  const fecha = new Date(fechaISO);

  return prisma.$transaction(async (tx) => {
    const gruposRealizadaViejos = await tx.fertilizacionGranularRealizadaGrupo.findMany({ where: { realizadaId }, select: { id: true } });
    await tx.fertilizacionGranularRealizadaGrupoCuadro.deleteMany({ where: { realizadaGrupoId: { in: gruposRealizadaViejos.map((g) => g.id) } } });
    await tx.fertilizacionGranularRealizadaGrupo.deleteMany({ where: { realizadaId } });

    for (const pg of repartoDespues.porGrupo) {
      const rg = await tx.fertilizacionGranularRealizadaGrupo.create({
        data: { realizadaId, grupoId: pg.grupoId, hectareasAtribuidas: pg.hectareasAtribuidas },
      });
      for (const m of repartoDespues.porMiembro.filter((x) => x.grupoId === pg.grupoId)) {
        const { cuadroId, variedad } = parseClaveMiembro(m.clave);
        await tx.fertilizacionGranularRealizadaGrupoCuadro.create({
          data: { realizadaGrupoId: rg.id, cuadroId, variedad, hectareasAtribuidas: m.hectareasAtribuidas },
        });
      }
    }

    await tx.fertilizacionGranularRealizada.update({
      where: { id: realizadaId },
      data: { personalId: input.personalId, grupoPagoId: input.grupoPagoId, horas: input.horas, hectareas: input.hectareas, comentario: input.comentario },
    });

    await tx.registroNomina.deleteMany({ where: { origen: "automatico_fertilizacion", referenciaOrigenId: realizadaId } });
    await crearNominaGranular(tx, realizadaId, fertilizacion.huertaId, fecha, input.hectareas, input.horas, input.personalId, input.grupoPagoId, repartoDespues, actividad.id, tarifaAplicada, editadoPorId);

    for (const grupo of fertilizacion.grupos) {
      const atribuidoAntes = repartoAntes.porGrupo.find((pg) => pg.grupoId === grupo.id)?.hectareasAtribuidas ?? 0;
      const atribuidoDespues = repartoDespues.porGrupo.find((pg) => pg.grupoId === grupo.id)?.hectareasAtribuidas ?? 0;
      for (const p of grupo.productos) {
        const cantidadAntes = proporcionDelGrupo(atribuidoAntes, Number(grupo.hectareasProgramadas), Number(p.cantidadTotalCalculada));
        const cantidadDespues = proporcionDelGrupo(atribuidoDespues, Number(grupo.hectareasProgramadas), Number(p.cantidadTotalCalculada));
        const delta = cantidadDespues - cantidadAntes;
        if (Math.abs(delta) <= 0.0000001) continue;

        const local = await tx.almacenLocal.upsert({
          where: { huertaId_productoId: { huertaId: fertilizacion.huertaId, productoId: p.productoId } },
          update: { cantidadReportadaAcumulada: { increment: delta } },
          create: { huertaId: fertilizacion.huertaId, productoId: p.productoId, cantidadReportadaAcumulada: delta },
        });
        await tx.almacenLocalMovimiento.create({
          data: { almacenLocalId: local.id, tipo: "ajuste_manual", cantidad: delta, referenciaId: fertilizacion.id, capturadoPorId: editadoPorId },
        });
      }
    }

    return tx.fertilizacionGranularRealizada.findUniqueOrThrow({
      where: { id: realizadaId },
      include: { grupos: { include: { cuadros: { include: { cuadro: true } } } } },
    });
  });
}

/** Cierra una fertilización programada que nunca se entregó (vencida a 15 días, o cancelación manual). */
export async function liberarGranularVencida(id: string, capturadoPorId: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id }, include: { productosDenormalizado: true } });
  if (fertilizacion.estado !== "programada") throw new TransicionFertilizacionInvalidaError("programada");

  const cantidadPorProducto = new Map<string, number>();
  for (const p of fertilizacion.productosDenormalizado) {
    cantidadPorProducto.set(p.productoId, (cantidadPorProducto.get(p.productoId) ?? 0) + Number(p.cantidadTotalCalculada));
  }

  return prisma.$transaction(async (tx) => {
    for (const [productoId, cantidad] of cantidadPorProducto) {
      const comprometido = await tx.almacenCentralMovimiento.findFirst({ where: { referenciaId: id, tipo: "salida_comprometida", productoId } });
      if (comprometido) {
        await liberarComprometido(tx, productoId, cantidad, id, capturadoPorId, "Liberación de fertilización granular vencida (15 días sin entregar) o cancelada manualmente.");
      }
    }
    await cancelarOrdenesDeReferencia(tx, id);
    return tx.fertilizacionGranular.update({ where: { id }, data: { estado: "vencida" } });
  });
}

/** Protocolo de cancelación (cierre por debajo de 100%, V1 P2): solo Director/Gerente Técnico, con nota obligatoria. 15 días desde fechaFin. */
export async function cancelarGranularEntregada(id: string, canceladaPorId: string, nota: string) {
  if (!nota || !nota.trim()) throw new Error("El cierre por debajo de 100% necesita una nota obligatoria.");
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id }, include: { productosDenormalizado: true, realizadas: true } });
  if (fertilizacion.estado !== "entregada" && fertilizacion.estado !== "realizada") {
    throw new NoSePuedeCancelarError("Solo se puede cancelar una fertilización que ya fue entregada al rancho.");
  }

  const diasSinAplicar = Math.floor((Date.now() - fertilizacion.fechaFin.getTime()) / 86_400_000);
  if (diasSinAplicar <= DIAS_VENCIMIENTO) {
    throw new NoSePuedeCancelarError(`Todavía no pasan los ${DIAS_VENCIMIENTO} días desde la fecha fin — lleva ${diasSinAplicar}.`);
  }

  const hectareasAvanzadas = fertilizacion.realizadas.reduce((s, r) => s + Number(r.hectareas), 0);
  const porcentajeAvance = hectareasAvanzadas / Number(fertilizacion.hectareasTotalesProgramadas);
  if (porcentajeAvance >= 0.9999) {
    throw new NoSePuedeCancelarError("Esta fertilización ya quedó completamente aplicada — no hay nada que cancelar.");
  }

  const cantidadPorProducto = new Map<string, number>();
  for (const p of fertilizacion.productosDenormalizado) {
    cantidadPorProducto.set(p.productoId, (cantidadPorProducto.get(p.productoId) ?? 0) + Number(p.cantidadTotalCalculada));
  }

  return prisma.$transaction(async (tx) => {
    for (const [productoId, cantidadTotal] of cantidadPorProducto) {
      const cantidadARegresar = cantidadTotal * (1 - porcentajeAvance);

      const local = await tx.almacenLocal.update({
        where: { huertaId_productoId: { huertaId: fertilizacion.huertaId, productoId } },
        data: { cantidadRecibidaAcumulada: { decrement: cantidadARegresar } },
      });
      await tx.almacenLocalMovimiento.create({
        data: { almacenLocalId: local.id, tipo: "ajuste_manual", cantidad: -cantidadARegresar, referenciaId: id, capturadoPorId: canceladaPorId },
      });

      const desglose = await desgloseLotesDeMovimientos(tx, id, productoId, ["salida_real"]);
      const aplicado = await regresarProporcionalALotes(tx, desglose, cantidadARegresar);
      const lote = aplicado.length === 0 ? await crearLoteRespaldo(tx, productoId, cantidadARegresar, "ABONO") : null;
      const porciones = lote ? [{ loteId: lote.id, cantidad: cantidadARegresar }] : aplicado;
      for (const parte of porciones) {
        await tx.almacenCentralMovimiento.create({
          data: { productoId, loteId: parte.loteId, tipo: "abono_sobrante", cantidad: parte.cantidad, huertaDestinoId: fertilizacion.huertaId, referenciaId: id, capturadoPorId: canceladaPorId },
        });
      }
    }

    await cancelarOrdenesDeReferencia(tx, id);

    return tx.fertilizacionGranular.update({
      where: { id },
      data: { estado: "cancelada", canceladaPorId, fechaCancelacion: new Date(), notaCierre: nota },
    });
  });
}

/** Firma digital de recepción del Encargado de Bodega — confirma que el producto devuelto ya llegó físicamente. */
export async function confirmarRecepcionCancelacionGranular(id: string, confirmadoPorId: string) {
  const fertilizacion = await prisma.fertilizacionGranular.findUniqueOrThrow({ where: { id } });
  if (fertilizacion.estado !== "cancelada") throw new NoSePuedeCancelarError("Esta fertilización no está cancelada — no hay nada que confirmar.");
  if (fertilizacion.confirmacionBodegaPorId) throw new NoSePuedeCancelarError("Ya se había confirmado la recepción de esta cancelación.");
  return prisma.fertilizacionGranular.update({
    where: { id },
    data: { confirmacionBodegaPorId: confirmadoPorId, fechaConfirmacionBodega: new Date() },
  });
}

/** Cancelaciones de Fertilización Granular pendientes de confirmar por Bodega. */
export async function listarCancelacionesPendientesConfirmarGranular() {
  const fertilizaciones = await prisma.fertilizacionGranular.findMany({
    where: { estado: "cancelada", confirmacionBodegaPorId: null },
    include: { huerta: true, productosDenormalizado: { include: { producto: true } } },
    orderBy: { fechaCancelacion: "asc" },
  });
  const filas: {
    id: string;
    tipo: "cancelacion";
    origen: "granular";
    huerta: { nombre: string };
    producto: { nombreComercial: string; unidad: string };
    cantidadRegresada: number;
    fecha: string | null;
  }[] = [];
  for (const f of fertilizaciones) {
    const productosUnicos = [...new Map(f.productosDenormalizado.map((p) => [p.productoId, p])).values()];
    for (const p of productosUnicos) {
      // Suma, no findFirst (V1 P1, 25-sep-2026): una devolución puede repartirse en varios movimientos, uno por lote de origen.
      const abonos = await prisma.almacenCentralMovimiento.findMany({ where: { referenciaId: f.id, tipo: "abono_sobrante", productoId: p.productoId } });
      const cantidadRegresada = abonos.reduce((s, m) => s + Number(m.cantidad), 0);
      if (cantidadRegresada <= 0) continue;
      filas.push({
        id: f.id,
        tipo: "cancelacion",
        origen: "granular",
        huerta: { nombre: f.huerta.nombre },
        producto: { nombreComercial: p.producto.nombreComercial, unidad: p.producto.unidad },
        cantidadRegresada,
        fecha: f.fechaCancelacion ? f.fechaCancelacion.toISOString() : null,
      });
    }
  }
  return filas;
}

/** Catálogo de fertilizantes ya autorizados — lo único elegible al programar (9.5). */
export async function productosParaFertilizacion() {
  return ingredientesAutorizados(await nombresCategoriasFertilizante());
}

/** Implementos elegibles cuando el recurso es "Con implemento" (9.5/9.13). */
export function equiposImplementoParaFertilizacion() {
  return listarEquipos("implemento");
}

/** Grupos de pago (catálogo global — 9.11), para "quién la hizo" al registrar realizada. */
export function gruposParaFertilizacion() {
  return prisma.grupoPago.findMany({ orderBy: { nombre: "asc" } });
}
