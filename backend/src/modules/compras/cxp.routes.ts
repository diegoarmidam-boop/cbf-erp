import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { listarCxP } from "./cxp.js";

export const cxpRouter = Router();
cxpRouter.use(requireAuth);

cxpRouter.get("/", requirePermission("compras", "ver"), async (_req, res) => {
  res.json(await listarCxP());
});
