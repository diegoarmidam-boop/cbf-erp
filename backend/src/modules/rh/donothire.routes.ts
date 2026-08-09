import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../core/db.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";

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

// Sin dependientes en el sistema (es solo una lista de referencia) — se
// puede borrar directo cuando la persona se aclara o se dio de alta por error.
doNotHireRouter.delete("/:id", requirePermission("do_not_hire", "capturar"), async (req, res) => {
  await prisma.doNotHire.delete({ where: { id: unoSolo(req.params.id) } });
  res.status(204).end();
});
