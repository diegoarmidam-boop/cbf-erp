import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Rol } from "@prisma/client";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import {
  confirmarEntrega,
  equiposImplementoParaAplicacion,
  gruposParaAplicacion,
  liberarAplicacionVencida,
  listarAplicaciones,
  obtenerAplicacion,
  productosParaAplicacion,
  programarAplicacion,
  ProductoNoAutorizadoAplicacionError,
  registrarRealizada,
  StockNoComprometidoError,
  TransicionAplicacionInvalidaError,
} from "./aplicaciones.js";

export const aplicacionesRouter = Router();
aplicacionesRouter.use(requireAuth);

// El documento distingue "Capturar (programar)" de "Capturar (realizada)"
// como acciones de roles distintos dentro del mismo módulo (9.7) — la
// matriz booleana de PermisoModulo no alcanza a expresar esa distinción
// (ambos grupos comparten capturar=true en "aplicaciones"), así que se
// verifica aquí por rol explícito, además del permiso de módulo.
const ROLES_PROGRAMAR: Rol[] = ["gerente_tecnico_produccion", "asistente_tecnico_produccion"];
const ROLES_REALIZADA: Rol[] = ["supervisor_huerta", "ayudante_supervisor"];
const ROLES_ACCESO_UNIVERSAL: Rol[] = ["director_general", "encargado_sistemas"];

function verificarRol(req: Request, res: Response, permitidos: Rol[]): boolean {
  const rol = req.usuario!.rol;
  if (ROLES_ACCESO_UNIVERSAL.includes(rol) || permitidos.includes(rol)) return true;
  res.status(403).json({ error: "Tu rol no puede realizar esta acción dentro de Aplicaciones." });
  return false;
}

function verificarAlcance(req: Request, res: Response, huertaId: string): boolean {
  const alcance = huertaIdDeAlcance(req);
  if (alcance && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return false;
  }
  return true;
}

aplicacionesRouter.get("/", requirePermission("aplicaciones", "ver"), async (req, res) => {
  const huertaId = typeof req.query.huertaId === "string" ? req.query.huertaId : undefined;
  const alcance = huertaIdDeAlcance(req);
  if (alcance && huertaId && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  res.json(await listarAplicaciones(huertaId ?? alcance ?? undefined));
});

aplicacionesRouter.get("/productos", requirePermission("aplicaciones", "ver"), async (_req, res) => {
  res.json(await productosParaAplicacion());
});

aplicacionesRouter.get("/equipos-implemento", requirePermission("aplicaciones", "ver"), async (_req, res) => {
  res.json(await equiposImplementoParaAplicacion());
});

aplicacionesRouter.get("/grupos", requirePermission("aplicaciones", "ver"), async (req, res) => {
  const huertaId = typeof req.query.huertaId === "string" ? req.query.huertaId : "";
  if (!huertaId) {
    res.status(400).json({ error: "huertaId es requerido." });
    return;
  }
  if (!verificarAlcance(req, res, huertaId)) return;
  res.json(await gruposParaAplicacion(huertaId));
});

aplicacionesRouter.get("/:id", requirePermission("aplicaciones", "ver"), async (req, res) => {
  const aplicacion = await obtenerAplicacion(unoSolo(req.params.id));
  if (!verificarAlcance(req, res, aplicacion.huertaId)) return;
  res.json(aplicacion);
});

const programarSchema = z.object({
  huertaId: z.string().min(1),
  cuadroIds: z.array(z.string().min(1)).min(1),
  productoId: z.string().min(1),
  recursoTipo: z.enum(["gente", "implemento"]),
  equipoId: z.string().optional(),
  concentracionValor: z.number().positive(),
  concentracionUnidad: z.enum(["ml_l", "g_l", "kg_l"]),
  litrosMezclaPorHa: z.number().positive(),
  fechaInicio: z.string(),
  fechaFin: z.string(),
});

aplicacionesRouter.post("/", requirePermission("aplicaciones", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  const parsed = programarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const aplicacion = await programarAplicacion(parsed.data, req.usuario!.usuarioId);
    res.status(201).json(aplicacion);
  } catch (err) {
    if (err instanceof ProductoNoAutorizadoAplicacionError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Confirmar entrega es, físicamente, una acción de Almacén (quien
// entrega el producto a la Huerta) — no de quien programó (9.7/9.15).
aplicacionesRouter.post("/:id/entregar", requirePermission("almacen", "capturar"), async (req, res) => {
  try {
    const aplicacion = await confirmarEntrega(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(aplicacion);
  } catch (err) {
    if (err instanceof TransicionAplicacionInvalidaError || err instanceof StockNoComprometidoError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const realizadaSchema = z.object({
  personalId: z.string().optional(),
  grupoId: z.string().optional(),
  horas: z.number().positive(),
  fechaReal: z.string(),
});

aplicacionesRouter.post("/:id/realizada", requirePermission("aplicaciones", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_REALIZADA)) return;
  const id = unoSolo(req.params.id);
  const aplicacion = await prisma.aplicacion.findUnique({ where: { id } });
  if (!aplicacion) {
    res.status(404).json({ error: "Aplicación no encontrada." });
    return;
  }
  if (!verificarAlcance(req, res, aplicacion.huertaId)) return;

  const parsed = realizadaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const realizada = await registrarRealizada(id, parsed.data, req.usuario!.usuarioId);
    res.status(201).json(realizada);
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Liberar (vencimiento de 15 días sin entregar, o cancelación manual) es
// una decisión de Dirección/Gerencia Técnica (9.7) — mismos roles que
// programan, no de campo.
aplicacionesRouter.post("/:id/liberar", requirePermission("aplicaciones", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  try {
    const aplicacion = await liberarAplicacionVencida(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(aplicacion);
  } catch (err) {
    if (err instanceof TransicionAplicacionInvalidaError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
