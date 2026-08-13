import { z, ZodIssueCode, type ZodErrorMap } from "zod";

// Traduce los mensajes de validación de Zod al español para TODO el backend
// — sin esto, cualquier dato inválido en cualquier formulario mostraba el
// mensaje de Zod en inglés (ej. "Number must be greater than 0"). Se
// registra una sola vez, aquí, en vez de repetir un mensaje por cada campo
// de cada esquema (imposible de mantener sin dejar alguno en inglés).
const TIPOS_ESP: Record<string, string> = {
  string: "texto",
  number: "número",
  boolean: "verdadero/falso",
  array: "lista",
  object: "objeto",
  date: "fecha",
  undefined: "vacío",
  null: "vacío",
};

function tipoEsp(tipo: string): string {
  return TIPOS_ESP[tipo] ?? tipo;
}

const mapaErroresEspanol: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type: {
      if (issue.received === "undefined" || issue.received === "null") {
        return { message: "Este campo es obligatorio." };
      }
      return { message: `Se esperaba ${tipoEsp(issue.expected)}, se recibió ${tipoEsp(issue.received)}.` };
    }

    case ZodIssueCode.too_small: {
      const min = issue.minimum;
      if (issue.type === "string") {
        return { message: min === 1 ? "Este campo es obligatorio." : `Debe tener al menos ${min} caracteres.` };
      }
      if (issue.type === "number" || issue.type === "bigint") {
        return { message: issue.inclusive ? `Debe ser mayor o igual que ${min}.` : `Debe ser mayor que ${min}.` };
      }
      if (issue.type === "array") {
        return { message: min === 1 ? "Debes agregar al menos un elemento." : `Debes agregar al menos ${min} elementos.` };
      }
      if (issue.type === "date") {
        return { message: `La fecha debe ser posterior a ${new Date(Number(min)).toLocaleDateString("es-MX")}.` };
      }
      break;
    }

    case ZodIssueCode.too_big: {
      const max = issue.maximum;
      if (issue.type === "string") return { message: `Debe tener como máximo ${max} caracteres.` };
      if (issue.type === "number" || issue.type === "bigint") {
        return { message: issue.inclusive ? `Debe ser menor o igual que ${max}.` : `Debe ser menor que ${max}.` };
      }
      if (issue.type === "array") return { message: `Debes agregar como máximo ${max} elementos.` };
      if (issue.type === "date") {
        return { message: `La fecha debe ser anterior a ${new Date(Number(max)).toLocaleDateString("es-MX")}.` };
      }
      break;
    }

    case ZodIssueCode.invalid_enum_value:
      return { message: `Valor inválido. Debe ser uno de: ${issue.options.join(", ")}.` };

    case ZodIssueCode.invalid_literal:
      return { message: `Valor inválido. Debe ser exactamente: ${JSON.stringify(issue.expected)}.` };

    case ZodIssueCode.invalid_union:
      return { message: "El valor no coincide con ninguna de las formas válidas." };

    case ZodIssueCode.invalid_union_discriminator:
      return { message: `Tipo inválido. Debe ser uno de: ${issue.options.join(", ")}.` };

    case ZodIssueCode.unrecognized_keys:
      return { message: `Campo(s) no reconocido(s): ${issue.keys.join(", ")}.` };

    case ZodIssueCode.invalid_date:
      return { message: "Fecha inválida." };

    case ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: "Correo electrónico inválido." };
      if (issue.validation === "uuid") return { message: "Identificador inválido." };
      if (issue.validation === "datetime") return { message: "Fecha/hora inválida." };
      return { message: "Formato de texto inválido." };

    case ZodIssueCode.not_multiple_of:
      return { message: `Debe ser múltiplo de ${issue.multipleOf}.` };

    case ZodIssueCode.custom:
      // Los mensajes de `.refine()`/`.superRefine()` ya los escribe quien
      // define el esquema (normalmente ya en español) — se respetan tal cual.
      return { message: issue.message ?? ctx.defaultError };
  }
  return { message: ctx.defaultError };
};

z.setErrorMap(mapaErroresEspanol);
