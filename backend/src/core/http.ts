// Express 5's tipos permiten params/query repetidos (string[]) por los
// patrones de path-to-regexp v8 — ninguna ruta de este proyecto los usa,
// así que esto solo aterriza el tipo de vuelta a string donde ya sabemos
// (por el patrón de la ruta) que siempre es un valor único.
export function unoSolo(valor: string | string[] | undefined): string {
  return Array.isArray(valor) ? (valor[0] ?? "") : (valor ?? "");
}

import type { ZodError } from "zod";

// Convierte el path de un issue (ej. ["productos", 0, "concentracionValor"])
// en palabras separadas y en minúsculas ("productos 1 concentracion valor")
// en vez del identificador de código tal cual — para que el mensaje se lea
// como una frase, no como una variable.
function humanizarCampo(path: (string | number)[]): string {
  if (path.length === 0) return "valor";
  return path
    .map((segmento) =>
      typeof segmento === "number" ? String(segmento + 1) : segmento.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
    )
    .join(" ");
}

// `parsed.error.message` de Zod es el JSON crudo de todos los issues —
// ilegible para quien está llenando un formulario. Esto lo convierte en
// una frase corta ("campo: motivo"), una por línea si hay varias. El
// mensaje en sí ya sale en español gracias al mapa de errores global
// (ver core/validacionEspanol.ts).
export function mensajeErrorValidacion(error: ZodError): string {
  return error.issues.map((issue) => `${humanizarCampo(issue.path)}: ${issue.message}`).join(" · ");
}

interface ErrorPrismaConocido {
  code: string;
  clientVersion: string;
  meta?: { target?: unknown };
}

// Duck-typing en vez de `instanceof PrismaClientKnownRequestError`: evita
// importar el runtime de Prisma solo para esto, y detecta igual cualquier
// error que venga de Prisma (P2002 = unique constraint, P2025 = registro no
// encontrado, etc.) sin acoplarse a una versión específica del cliente.
function esErrorPrismaConocido(err: unknown): err is ErrorPrismaConocido {
  return typeof err === "object" && err !== null && "code" in err && typeof (err as { code: unknown }).code === "string" && "clientVersion" in err;
}

// Bug crítico 16-ago-2026 (ver Actividades, duplicados en la misma línea):
// varias rutas atrapaban CUALQUIER Error y exponían `err.message` crudo al
// cliente, sin distinguir entre errores de negocio ya escritos en español a
// propósito y errores técnicos de Prisma que nunca deben llegar así a
// pantalla (ej. "Unique constraint failed on the constraint: `PRIMARY`").
// Este helper centraliza esa distinción — úsalo en cualquier catch de ruta
// que hoy hace `err instanceof Error ? err.message : "..."`.
export function mensajeErrorCaptura(err: unknown): string {
  if (esErrorPrismaConocido(err)) {
    if (err.code === "P2002") {
      const target = String(err.meta?.target ?? "");
      const campo = target.includes("personalId") ? "esa persona" : target.includes("username") ? "usuario" : target.includes("folio") ? "folio" : target.includes("nombre") ? "nombre" : "valor";
      return `Ya existe un registro con ese mismo ${campo} — revisa si seleccionaste algo repetido.`;
    }
    if (err.code === "P2025") return "El registro que se intentó usar ya no existe — puede que alguien más lo haya modificado.";
    return "Ocurrió un error inesperado al guardar. Si se repite, avisa a soporte técnico con la hora exacta.";
  }
  return err instanceof Error ? err.message : "Ocurrió un error inesperado.";
}
