// Express 5's tipos permiten params/query repetidos (string[]) por los
// patrones de path-to-regexp v8 — ninguna ruta de este proyecto los usa,
// así que esto solo aterriza el tipo de vuelta a string donde ya sabemos
// (por el patrón de la ruta) que siempre es un valor único.
export function unoSolo(valor: string | string[] | undefined): string {
  return Array.isArray(valor) ? (valor[0] ?? "") : (valor ?? "");
}
