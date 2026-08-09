import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Rol } from "@prisma/client";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import {
  confirmarEntregaGranular,
  equiposImplementoParaFertilizacion,
  gruposParaFertilizacion,
  liberarGranularVencida,
  listarGranular,
  obtenerGranular,
  productosParaFertilizacion,
  programarGranular,
  ProductoNoAutorizadoFertilizanteError,
  registrarRealizadaGranular,
  StockNoComprometidoError,
  TransicionFertilizacionInvalidaError,
} from "./granular.js";

export const granularRouter = Router();
granularRouter.use(requireAuth);

// Mismo motivo que en Aplicaciones (9.7): el documento distingue "Capturar
// (programar)" de "Capturar (realizada)" como roles distintos, algo que la
// matriz booleana de PermisoModulo no expresa dentro de un mismo módulo.
const ROLES_PROGRAMAR: Rol[] = ["gerente_tecnico_produccion", "asistente_tecnico_produccion"];
const ROLES_REALIZADA: Rol[] = ["supervisor_huerta"];
const ROLES_ACCESO_UNIVERSAL: Rol[] = ["director_general", "encargado_sistemas"];

function verificarRol(req: Request, res: Response, permitidos: Rol[]): boolean {
  const rol = req.usuario!.rol;
  if (ROLES_ACCESO_UNIVERSAL.includes(rol) || permitidos.includes(rol)) return true;
  res.status(403).json({ error: "Tu rol no puede realizar esta acción dentro de Fertilizantes." });
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

granularRouter.get("/", requirePermission("fertilizantes", "ver"), async (req, res) => {
  const huertaId = typeof req.query.huertaId === "string" ? req.query.huertaId : undefined;
  const alcance = huertaIdDeAlcance(req);
  if (alcance && huertaId && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  res.json(await listarGranular(huertaId ?? alcance ?? undefined));
});

granularRouter.get("/productos", requirePermission("fertilizantes", "ver"), async (_req, res) => {
  res.json(await productosParaFertilizacion());
});

granularRouter.get("/equipos-implemento", requirePermission("fertilizantes", "ver"), async (_req, res) => {
  res.json(await equiposImplementoParaFertilizacion());
});

granularRouter.get("/grupos", requirePermission("fertilizantes", "ver"), async (req, res) => {
  const huertaId = typeof req.query.huertaId === "string" ? req.query.huertaId : "";
  if (!huertaId) {
    res.status(400).json({ error: "huertaId es requerido." });
    return;
  }
  if (!verificarAlcance(req, res, huertaId)) return;
  res.json(await gruposParaFertilizacion(huertaId));
});

granularRouter.get("/:id", requirePermission("fertilizantes", "ver"), async (req, res) => {
  const fertilizacion = await obtenerGranular(unoSolo(req.params.id));
  if (!verificarAlcance(req, res, fertilizacion.huertaId)) return;
  res.json(fertilizacion);
});

const programarSchema = z.object({
  huertaId: z.string().min(1),
  cuadroIds: z.array(z.string().min(1)).min(1),
  productoId: z.string().min(1),
  recursoTipo: z.enum(["gente", "implemento"]),
  equipoId: z.string().optional(),
  modoDosis: z.enum(["kg_ha", "g_planta"]),
  dosisValor: z.number().positive(),
  fechaInicio: z.string(),
  fechaFin: z.string(),
});

granularRouter.post("/", requirePermission("fertilizantes", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  const parsed = programarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const fertilizacion = await programarGranular(parsed.data, req.usuario!.usuarioId);
    res.status(201).json(fertilizacion);
  } catch (err) {
    if (err instanceof ProductoNoAutorizadoFertilizanteError) {
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

// Confirmar entrega es una acción de Almacén (9.5/9.15), no de quien programó.
granularRouter.post("/:id/entregar", requirePermission("almacen", "capturar"), async (req, res) => {
  try {
    const fertilizacion = await confirmarEntregaGranular(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(fertilizacion);
  } catch (err) {
    if (err instanceof TransicionFertilizacionInvalidaError || err instanceof StockNoComprometidoError) {
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

granularRouter.post("/:id/realizada", requirePermission("fertilizantes", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_REALIZADA)) return;
  const id = unoSolo(req.params.id);
  const fertilizacion = await prisma.fertilizacionGranular.findUnique({ where: { id } });
  if (!fertilizacion) {
    res.status(404).json({ error: "Fertilización no encontrada." });
    return;
  }
  if (!verificarAlcance(req, res, fertilizacion.huertaId)) return;

  const parsed = realizadaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const realizada = await registrarRealizadaGranular(id, parsed.data, req.usuario!.usuarioId);
    res.status(201).json(realizada);
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

granularRouter.post("/:id/liberar", requirePermission("fertilizantes", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  try {
    const fertilizacion = await liberarGranularVencida(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(fertilizacion);
  } catch (err) {
    if (err instanceof TransicionFertilizacionInvalidaError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
