import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { crearEquipo, listarEquipos, sugerirFolio } from "./equipos.js";

export const equiposRouter = Router();
equiposRouter.use(requireAuth);

const tipoEnum = z.enum(["tractor", "camioneta", "remolque", "implemento"]);

equiposRouter.get("/", requirePermission("equipos", "ver"), async (req, res) => {
  const tipo = tipoEnum.safeParse(req.query.tipo);
  res.json(await listarEquipos(tipo.success ? tipo.data : undefined));
});

equiposRouter.get("/sugerir-folio", requirePermission("equipos", "capturar"), async (req, res) => {
  const tipo = tipoEnum.safeParse(req.query.tipo);
  if (!tipo.success) {
    res.status(400).json({ error: "tipo es requerido." });
    return;
  }
  res.json({ folio: await sugerirFolio(tipo.data) });
});

const altaSchema = z.object({
  tipo: tipoEnum,
  folio: z.string().min(1),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  anio: z.number().int().optional(),
  placas: z.string().optional(),
});

equiposRouter.post("/", requirePermission("equipos", "capturar"), async (req, res) => {
  const parsed = altaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.status(201).json(await crearEquipo(parsed.data));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "No se pudo crear." });
  }
});
