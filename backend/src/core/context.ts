import { AsyncLocalStorage } from "node:async_hooks";

// Lleva quién es el usuario actual a través de una misma request, sin tener
// que pasarlo a mano por cada función — lo usa la capa de auditoría para
// saber quién capturó/modificó cada registro (bloque 6 del documento vivo).
export interface RequestContext {
  usuarioId: string;
  rol: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function requireContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) throw new Error("No hay contexto de usuario autenticado en este punto de ejecución.");
  return ctx;
}
