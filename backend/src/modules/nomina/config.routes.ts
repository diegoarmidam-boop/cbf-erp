import { Router } from "express";
import { z } from "zod";
import { mensajeErrorValidacion } from "../../core/http.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { actualizarConfigNomina, obtenerConfigNomina } from "./config.js";
import { NOMBRES_DIAS } from "@cbf/shared";

export const configRouter = Router();
configRouter.use(requireAuth);

configRouter.get("/", requirePermission("nomina", "ver"), async (_req, res) => {
  res.json(await obtenerConfigNomina());
});

const actualizarSchema = z.object({
  diaCorteSemanal: z.enum(NOMBRES_DIAS).optional(),
  diasGraciaCierre: z.number().int().min(0).optional(),
  tarifaGeneralHora: z.number().positive().optional(),
});

configRouter.put("/", requirePermission("nomina", "editar"), async (req, res) => {
  const parsed = actualizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  await actualizarConfigNomina(parsed.data);
  res.json(await obtenerConfigNomina());
});
