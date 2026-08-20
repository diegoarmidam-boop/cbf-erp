import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Rol } from "@prisma/client";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { mensajeErrorCaptura, mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import {
  confirmarEntregaFertirriego,
  liberarFertirriegoVencido,
  listarFertirriego,
  obtenerFertirriego,
  programarFertirriego,
} from "./fertirriego.js";
import { ProductoNoAutorizadoFertilizanteError, StockNoComprometidoError, TransicionFertilizacionInvalidaError } from "./granular.js";

export const fertirriegoRouter = Router();
fertirriegoRouter.use(requireAuth);

// Mismo motivo que Granular/Aplicaciones: "Capturar (programar)" es de
// Dirección/Gerencia Técnica/Asistentes, no algo que la matriz booleana
// distinga dentro de un mismo módulo.
const ROLES_PROGRAMAR: Rol[] = ["gerente_tecnico_produccion", "asistente_tecnico_produccion"];
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

fertirriegoRouter.get("/", requirePermission("fertilizantes", "ver"), async (req, res) => {
  const huertaId = typeof req.query.huertaId === "string" ? req.query.huertaId : undefined;
  const alcance = huertaIdDeAlcance(req);
  if (alcance && huertaId && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  res.json(await listarFertirriego(huertaId ?? alcance ?? undefined));
});

fertirriegoRouter.get("/:id", requirePermission("fertilizantes", "ver"), async (req, res) => {
  const fertirriego = await obtenerFertirriego(unoSolo(req.params.id));
  if (!verificarAlcance(req, res, fertirriego.huertaId)) return;
  res.json(fertirriego);
});

const productoFertirriegoSchema = z.object({
  productoId: z.string().min(1),
  dosisValor: z.number().positive(),
  dosisUnidad: z.enum(["ml_l", "g_l", "kg_l"]),
});

const programarSchema = z.object({
  huertaId: z.string().min(1),
  seccionIds: z.array(z.string().min(1)).min(1),
  productos: z.array(productoFertirriegoSchema).min(1),
  litrosAguaPorHa: z.number().positive(),
  frecuencia: z.enum(["diario", "cada_2_dias", "cada_3_dias", "patron_2_1"]),
  fechaInicio: z.string(),
  fechaFin: z.string(),
});

fertirriegoRouter.post("/", requirePermission("fertilizantes", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  const parsed = programarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const fertirriego = await programarFertirriego(parsed.data, req.usuario!.usuarioId);
    res.status(201).json(fertirriego);
  } catch (err) {
    if (err instanceof ProductoNoAutorizadoFertilizanteError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: mensajeErrorCaptura(err) });
      return;
    }
    throw err;
  }
});

// Confirmar entrega es una acción de Almacén (9.5/9.15). A partir de aquí la
// ejecución diaria del fertirriego vive en Riego (9.6), todavía no construido.
fertirriegoRouter.post("/:id/entregar", requirePermission("almacen", "capturar"), async (req, res) => {
  try {
    const fertirriego = await confirmarEntregaFertirriego(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(fertirriego);
  } catch (err) {
    if (err instanceof TransicionFertilizacionInvalidaError || err instanceof StockNoComprometidoError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

fertirriegoRouter.post("/:id/liberar", requirePermission("fertilizantes", "capturar"), async (req, res) => {
  if (!verificarRol(req, res, ROLES_PROGRAMAR)) return;
  try {
    const fertirriego = await liberarFertirriegoVencido(unoSolo(req.params.id), req.usuario!.usuarioId);
    res.json(fertirriego);
  } catch (err) {
    if (err instanceof TransicionFertilizacionInvalidaError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
