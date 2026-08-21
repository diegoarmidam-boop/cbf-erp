import { prisma } from "./db.js";
import { requireContext } from "./context.js";

// Lista canónica de módulos con switch de comunicación (bloque de
// arquitectura, 20-ago-2026) — mismos identificadores que ya usa
// PermisoModulo (seed-data/permisos.ts), para no inventar una segunda
// nomenclatura de módulos. Aplica a todos, no solo a los que hoy generan
// cascada — Nómina/Compras/Almacén/Equipos quedan con su switch listo
// aunque todavía no lo usen.
export const MODULOS_CON_SWITCH = [
  "unidades_produccion",
  "actividades",
  "aplicaciones",
  "fertilizantes",
  "riego",
  "almacen",
  "compras",
  "equipos",
  "nomina",
  "rh",
] as const;

export type ModuloConSwitch = (typeof MODULOS_CON_SWITCH)[number];

const ETIQUETAS: Record<ModuloConSwitch, string> = {
  unidades_produccion: "Unidades de Producción",
  actividades: "Actividades",
  aplicaciones: "Aplicaciones",
  fertilizantes: "Fertilizantes",
  riego: "Riego",
  almacen: "Almacén",
  compras: "Compras",
  equipos: "Equipos y Maquinaria",
  nomina: "Nómina",
  rh: "Recursos Humanos",
};

export function etiquetaModulo(modulo: string): string {
  return ETIQUETAS[modulo as ModuloConSwitch] ?? modulo;
}

// Cache en memoria del proceso (10 segundos): esta función se llama antes
// de cada cascada automática, potencialmente varias veces por petición
// (ej. una Aplicación reportada como realizada puede disparar Nómina y
// Equipos en la misma llamada) — sin cache, cada cascada pagaría una
// consulta a MySQL solo para leer un booleano que casi nunca cambia. 10s
// es suficiente para que apagar un switch desde la pantalla de
// Configuración se sienta inmediato en la práctica, sin pegarle a la base
// de datos en cada cascada.
const cache = new Map<string, { valor: boolean; expira: number }>();
const TTL_MS = 10_000;

export async function comunicacionActiva(modulo: ModuloConSwitch): Promise<boolean> {
  const entrada = cache.get(modulo);
  if (entrada && entrada.expira > Date.now()) return entrada.valor;

  const fila = await prisma.moduloConfig.findUnique({ where: { modulo } });
  // Sin fila todavía (ej. base de datos recién restaurada sin volver a
  // correr el seed) — por default la comunicación está activa, nunca
  // apagada por accidente de infraestructura.
  const valor = fila?.comunicacionActiva ?? true;
  cache.set(modulo, { valor, expira: Date.now() + TTL_MS });
  return valor;
}

export function invalidarCacheModuloComunicacion(): void {
  cache.clear();
}

export async function listarModulosConfig() {
  const filas = await prisma.moduloConfig.findMany();
  const porModulo = new Map(filas.map((f) => [f.modulo, f.comunicacionActiva]));
  return MODULOS_CON_SWITCH.map((modulo) => ({
    modulo,
    etiqueta: etiquetaModulo(modulo),
    comunicacionActiva: porModulo.get(modulo) ?? true,
  }));
}

export async function cambiarModuloConfig(modulo: ModuloConSwitch, comunicacionActiva: boolean) {
  const anterior = await prisma.moduloConfig.findUnique({ where: { modulo } });
  const resultado = await prisma.moduloConfig.upsert({
    where: { modulo },
    update: { comunicacionActiva },
    create: { modulo, comunicacionActiva },
  });
  invalidarCacheModuloComunicacion();

  // Bitácora explícita (20-ago-2026, "quién apagó qué módulo y cuándo, sin
  // preguntarle a nadie") — ModuloConfig usa `modulo` como llave primaria,
  // no `id`, así que el extension genérico de auditoría de db.ts no lo
  // captura solo (ver comentario ahí). Mismo registro de AuditoriaLog que
  // usa el resto del sistema, para que se vea junto con todo lo demás.
  const ctx = requireContext();
  await prisma.auditoriaLog.create({
    data: {
      tabla: "ModuloConfig",
      registroId: modulo,
      accion: "editar",
      valorAnterior: anterior ? { comunicacionActiva: anterior.comunicacionActiva } : undefined,
      valorNuevo: { comunicacionActiva },
      usuarioId: ctx.usuarioId,
    },
  });

  return resultado;
}
