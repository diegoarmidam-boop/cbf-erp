import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { listarUsoDiario, registrarUsoDiario } from "./uso-diario.js";

export const usoDiarioRouter = Router();
usoDiarioRouter.use(requireAuth);

usoDiarioRouter.get("/:equipoId", requirePermission("equipos", "ver"), async (req, res) => {
  res.json(await listarUsoDiario(unoSolo(req.params.equipoId)));
});

const usoSchema = z.object({ fecha: z.string(), operadorId: z.string().min(1), horas: z.number().positive(), huertaId: z.string().min(1) });

usoDiarioRouter.post("/:equipoId", requirePermission("equipos", "capturar"), async (req, res) => {
  const parsed = usoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const { fecha, operadorId, horas, huertaId } = parsed.data;
  res.status(201).json(await registrarUsoDiario(unoSolo(req.params.equipoId), fecha, operadorId, horas, huertaId));
});
