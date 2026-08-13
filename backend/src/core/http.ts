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
