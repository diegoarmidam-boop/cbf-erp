import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { calcularAlertaRendimiento, historialCargas, OdometroRetrocedeError, registrarCarga } from "./combustible.js";

export const combustibleRouter = Router();
combustibleRouter.use(requireAuth);

combustibleRouter.get("/:equipoId", requirePermission("equipos", "ver"), async (req, res) => {
  res.json(await historialCargas(unoSolo(req.params.equipoId)));
});

combustibleRouter.get("/:equipoId/alerta-rendimiento", requirePermission("equipos", "ver"), async (req, res) => {
  res.json(await calcularAlertaRendimiento(unoSolo(req.params.equipoId)));
});

const cargaSchema = z.object({
  fecha: z.string(),
  tipo: z.enum(["diesel_garrafa", "gasolina_externa", "diesel_externo"]),
  odometro: z.number().nonnegative().optional(),
  horometro: z.number().nonnegative().optional(),
  litros: z.number().positive(),
  precioUnitario: z.number().nonnegative().optional(),
  productoId: z.string().optional(),
});

combustibleRouter.post("/:equipoId", requirePermission("equipos", "capturar"), async (req, res) => {
  const parsed = cargaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const carga = await registrarCarga(unoSolo(req.params.equipoId), parsed.data, req.usuario!.usuarioId);
    res.status(201).json(carga);
  } catch (err) {
    if (err instanceof OdometroRetrocedeError) {
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
