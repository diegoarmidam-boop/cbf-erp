import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../core/db.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";

// NOTA DE ALCANCE: esto es un stub mínimo — solo alta y listado de Huertas —
// para que Nómina (módulo 1) tenga algo contra qué capturar. La ficha
// completa de Unidades de Producción (Cuadros, Ciclos, Marco de Plantación,
// Secciones de Riego) es el módulo 3 del orden de construcción y se
// construye aparte, con su propia revisión.
export const huertasRouter = Router();
huertasRouter.use(requireAuth);

huertasRouter.get("/", requirePermission("unidades_produccion", "ver"), async (_req, res) => {
  res.json(await prisma.huerta.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }));
});

const crearHuertaSchema = z.object({
  nombre: z.string().min(1),
  hectareasTotales: z.number().positive(),
});

huertasRouter.post("/", requirePermission("unidades_produccion", "capturar"), async (req, res) => {
  const parsed = crearHuertaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const huerta = await prisma.huerta.create({ data: parsed.data });
  res.status(201).json(huerta);
});
