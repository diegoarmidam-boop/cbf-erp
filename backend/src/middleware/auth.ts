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

// Para roles con alcance restringido a su propia Huerta (Supervisor,
// Regador, Ayudante) — filtra los datos, no reemplaza requirePermission.
export function huertaIdDeAlcance(req: Request): string | null {
  return req.usuario?.huertaId ?? null;
}
