import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../core/db.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";

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
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const puesto = await prisma.puesto.create({ data: parsed.data });
  res.status(201).json(puesto);
});

puestosRouter.patch("/:id", requirePermission("rh", "editar"), async (req, res) => {
  const parsed = puestoSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const puesto = await prisma.puesto.update({ where: { id: unoSolo(req.params.id) }, data: parsed.data });
  res.json(puesto);
});

// Puesto no tiene campo `activo` — no tiene sentido "desactivar" un catálogo
// tan simple, así que se borra de verdad, pero solo si ya no tiene Personal
// asignado (si no, se rompería esa referencia).
puestosRouter.delete("/:id", requirePermission("rh", "editar"), async (req, res) => {
  const id = unoSolo(req.params.id);
  const enUso = await prisma.personal.findFirst({ where: { puestoId: id } });
  if (enUso) {
    res.status(409).json({ error: "Este puesto tiene Personal asignado — no se puede borrar." });
    return;
  }
  await prisma.puesto.delete({ where: { id } });
  res.status(204).end();
});
