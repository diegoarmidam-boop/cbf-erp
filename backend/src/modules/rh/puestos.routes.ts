import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../core/db.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";

export const puestosRouter = Router();
puestosRouter.use(requireAuth);

puestosRouter.get("/", requirePermission("rh", "ver"), async (_req, res) => {
  res.json(await prisma.puesto.findMany({ orderBy: { nombre: "asc" } }));
});

const puestoSchema = z.object({
  nombre: z.string().min(1),
  periodicidad: z.enum(["semanal", "quincenal", "mensual"]),
  rangoSalarialMin: z.number().nonnegative().optional(),
  rangoSalarialMax: z.number().nonnegative().optional(),
  metodoAsignacionCosto: z.enum(["directo_huerta", "prorrateo_hectareas"]),
});

puestosRouter.post("/", requirePermission("rh", "capturar"), async (req, res) => {
  const parsed = puestoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const puesto = await prisma.puesto.create({ data: parsed.data });
  res.status(201).json(puesto);
});

puestosRouter.patch("/:id", requirePermission("rh", "editar"), async (req, res) => {
  const parsed = puestoSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const puesto = await prisma.puesto.update({ where: { id: unoSolo(req.params.id) }, data: parsed.data });
  res.json(puesto);
});
