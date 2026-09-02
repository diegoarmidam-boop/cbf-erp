// Importe convertido a letra para la Orden de Compra en PDF (2-sep-2026,
// 9.14) — formato estándar mexicano de comprobantes: "SON: ONCE MIL
// DOSCIENTOS PESOS 00/100 M.N.". Convierte pesos con hasta 2 decimales de
// centavos; no maneja negativos (un importe de compra nunca lo es).

const UNIDADES = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const DIECIS = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const VEINTIS = ["VEINTE", "VEINTIÚN", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function decenaALetra(n: number): string {
  if (n < 10) return UNIDADES[n]!;
  if (n < 20) return DIECIS[n - 10]!;
  if (n < 30) return VEINTIS[n - 20]!;
  const decena = Math.floor(n / 10);
  const unidad = n % 10;
  return unidad === 0 ? DECENAS[decena]! : `${DECENAS[decena]} Y ${UNIDADES[unidad]}`;
}

function centenaALetra(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const prefijo = CENTENAS[centena]!;
  return resto === 0 ? prefijo : prefijo ? `${prefijo} ${decenaALetra(resto)}` : decenaALetra(resto);
}

/** Grupo de 3 dígitos (0-999) a letra, con "UN" -> "UNO" para el caso suelto de unidades (se ajusta en el llamador para "UN MIL" vs "UNO"). */
function grupoALetra(n: number): string {
  return centenaALetra(n);
}

function enteroALetra(n: number): string {
  if (n === 0) return "CERO";

  const millones = Math.floor(n / 1_000_000);
  const restoMillones = n % 1_000_000;
  const miles = Math.floor(restoMillones / 1000);
  const centenas = restoMillones % 1000;

  const partes: string[] = [];

  if (millones > 0) {
    partes.push(millones === 1 ? "UN MILLÓN" : `${grupoALetra(millones)} MILLONES`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "MIL" : `${grupoALetra(miles)} MIL`);
  }
  if (centenas > 0) {
    partes.push(grupoALetra(centenas));
  }

  return partes.join(" ");
}

/** "SON: ONCE MIL DOSCIENTOS PESOS 00/100 M.N." */
export function importeALetra(monto: number): string {
  const entero = Math.floor(Math.round(monto * 100) / 100);
  const centavos = Math.round((monto - entero) * 100);
  const centavosTexto = String(centavos).padStart(2, "0");
  const pesos = entero === 1 ? "PESO" : "PESOS";
  return `SON: ${enteroALetra(entero)} ${pesos} ${centavosTexto}/100 M.N.`;
}
