import { Router } from "express";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { listarIndicadores } from "./indicadores.js";

export const indicadoresRouter = Router();
indicadoresRouter.use(requireAuth);

indicadoresRouter.get("/", requirePermission("indicadores", "ver"), async (req, res) => {
  const huertaId = typeof req.query.huertaId === "string" ? req.query.huertaId : undefined;
  const alcance = huertaIdDeAlcance(req);
  if (alcance && huertaId && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  res.json(await listarIndicadores(huertaId ?? alcance ?? undefined));
});
