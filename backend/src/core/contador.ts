import type { TransactionClient } from "./db.js";

/**
 * Folio consecutivo atómico (2-sep-2026, primer uso: Orden de Compra en
 * PDF) — `{increment}` dentro de la MISMA transacción que crea el
 * registro que lo usa, para que MySQL/InnoDB bloquee la fila del contador
 * hasta el commit y dos peticiones concurrentes nunca puedan sacar el
 * mismo número (a diferencia del folio de Equipos, que solo escanea el
 * máximo existente + 1 y depende de la constraint @unique para no
 * duplicar — ver comentario en equipos.ts).
 */
export async function siguienteFolio(tx: TransactionClient, nombre: string): Promise<number> {
  const contador = await tx.contador.upsert({
    where: { nombre },
    create: { nombre, valor: 1 },
    update: { valor: { increment: 1 } },
  });
  return contador.valor;
}
