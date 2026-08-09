import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { almacenLocalDeHuerta, candadosDeHuerta, reportarConsumo } from "./almacen-local.js";

export const almacenLocalRouter = Router();
almacenLocalRouter.use(requireAuth);

function verificarAlcance(req: Request, res: Response, huertaId: string): boolean {
  const alcance = huertaIdDeAlcance(req);
  if (alcance && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return false;
  }
  return true;
}

almacenLocalRouter.get("/:huertaId", requirePermission("almacen", "ver"), async (req, res) => {
  const huertaId = unoSolo(req.params.huertaId);
  if (!verificarAlcance(req, res, huertaId)) return;
  res.json(await almacenLocalDeHuerta(huertaId));
});

almacenLocalRouter.get("/:huertaId/candados", requirePermission("almacen", "ver"), async (req, res) => {
  const huertaId = unoSolo(req.params.huertaId);
  if (!verificarAlcance(req, res, huertaId)) return;
  res.json(await candadosDeHuerta(huertaId));
});

const consumoSchema = z.object({ cantidad: z.number().positive() });

almacenLocalRouter.post("/:almacenLocalId/reportar-consumo", requirePermission("almacen", "capturar"), async (req, res) => {
  const parsed = consumoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(await reportarConsumo(unoSolo(req.params.almacenLocalId), parsed.data.cantidad, req.usuario!.usuarioId));
});
