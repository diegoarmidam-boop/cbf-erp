import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../core/db.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";

export const doNotHireRouter = Router();
doNotHireRouter.use(requireAuth);

doNotHireRouter.get("/", requirePermission("do_not_hire", "ver"), async (_req, res) => {
  res.json(await prisma.doNotHire.findMany({ orderBy: { fecha: "desc" } }));
});

const altaSchema = z.object({
  nombreReferencia: z.string().min(1),
  motivo: z.string().min(1),
  condicionesSalida: z.string().optional(),
});

doNotHireRouter.post("/", requirePermission("do_not_hire", "capturar"), async (req, res) => {
  const parsed = altaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const entrada = await prisma.doNotHire.create({
    data: { ...parsed.data, registradoPorId: req.usuario!.usuarioId },
  });
  res.status(201).json(entrada);
});
