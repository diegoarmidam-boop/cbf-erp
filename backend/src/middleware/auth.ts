import type { NextFunction, Request, Response } from "express";
import { verifyToken, type TokenPayload } from "../core/auth.js";
import { runWithContext } from "../core/context.js";
import { tienePermiso, type Accion } from "../core/permissions.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: TokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Falta el encabezado Authorization." });
    return;
  }
  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    req.usuario = payload;
    runWithContext({ usuarioId: payload.usuarioId, rol: payload.rol }, () => next());
  } catch {
    res.status(401).json({ error: "Token inválido o vencido." });
  }
}

// Un dispositivo = un usuario; el candado de módulo × acción vive aquí, del
// lado del servidor — nunca se confía solo en que la UI oculte el botón.
export function requirePermission(modulo: string, accion: Accion) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.usuario) {
      res.status(401).json({ error: "No autenticado." });
      return;
    }
    const permitido = await tienePermiso(req.usuario.rol, modulo, accion);
    if (!permitido) {
      res.status(403).json({ error: `Tu rol no tiene permiso de "${accion}" en ${modulo}.` });
      return;
    }
    next();
  };
}

// Para endpoints que sirven tanto a quien captura como a quien solo
// consulta (ej. la lista de grupos de pago al armar la Captura del día) —
// cualquiera de los pares (módulo, acción) basta.
export function requirePermissionAny(...pares: [string, Accion][]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.usuario) {
      res.status(401).json({ error: "No autenticado." });
      return;
    }
    for (const [modulo, accion] of pares) {
      if (await tienePermiso(req.usuario.rol, modulo, accion)) {
        next();
        return;
      }
    }
    res.status(403).json({ error: "Tu rol no tiene permiso para esta acción." });
  };
}

// Para roles con alcance restringido a su propia Huerta (Supervisor,
// Regador, Ayudante) — filtra los datos, no reemplaza requirePermission.
export function huertaIdDeAlcance(req: Request): string | null {
  return req.usuario?.huertaId ?? null;
}

// Configuración → Catálogos (Prioridad 6, 4-sep-2026): editar o
// desactivar/reactivar un valor YA EXISTENTE de cualquier catálogo abierto
// es exclusivo de Director General/Encargado de Sistemas — sin importar
// qué rol pueda agregar un valor nuevo ("+") desde el módulo de uso, y sin
// importar lo que diga la matriz de permisos normal (nunca se confía solo
// en la UI ocultando el botón). El "+" de cada módulo no pasa por aquí.
export function requireDirectorOSistemas(req: Request, res: Response, next: NextFunction): void {
  if (!req.usuario) {
    res.status(401).json({ error: "No autenticado." });
    return;
  }
  if (req.usuario.rol !== "director_general" && req.usuario.rol !== "encargado_sistemas") {
    res.status(403).json({ error: "Editar o desactivar un catálogo ya existente es exclusivo de Dirección General." });
    return;
  }
  next();
}
