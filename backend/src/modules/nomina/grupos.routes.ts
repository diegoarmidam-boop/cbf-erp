import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../core/db.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { agregarMiembroAGrupo, miembrosDeGrupoEnFecha, quitarMiembroDeGrupo } from "./grupos.js";

export const gruposRouter = Router();
gruposRouter.use(requireAuth);

gruposRouter.get("/", requirePermission("nomina", "ver"), async (req, res) => {
  const huertaId = String(req.query.huertaId ?? "");
  if (!huertaId) {
    res.status(400).json({ error: "huertaId es requerido." });
    return;
  }
  const grupos = await prisma.grupoPago.findMany({ where: { huertaId } });
  const fecha = typeof req.query.fecha === "string" ? req.query.fecha : undefined;
  const conMiembros = await Promise.all(
    grupos.map(async (g) => ({
      ...g,
      miembrosHoy: fecha ? await miembrosDeGrupoEnFecha(g.id, fecha) : undefined,
    }))
  );
  res.json(conMiembros);
});

const crearGrupoSchema = z.object({
  huertaId: z.string().min(1),
  nombre: z.string().optional(),
  persistente: z.boolean().default(true),
  fecha: z.string(), // fecha del primer miembro / creación (YYYY-MM-DD)
  miembros: z.array(z.string().min(1)).min(1),
});

gruposRouter.post("/", requirePermission("nomina", "capturar"), async (req, res) => {
  const parsed = crearGrupoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { huertaId, nombre, persistente, fecha, miembros } = parsed.data;
  const grupo = await prisma.grupoPago.create({ data: { huertaId, nombre, persistente } });
  for (const personalId of miembros) {
    await agregarMiembroAGrupo(grupo.id, personalId, fecha);
  }
  res.status(201).json(grupo);
});

const miembroSchema = z.object({ personalId: z.string().min(1), fecha: z.string() });

gruposRouter.post("/:id/miembros", requirePermission("nomina", "capturar"), async (req, res) => {
  const parsed = miembroSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await agregarMiembroAGrupo(unoSolo(req.params.id), parsed.data.personalId, parsed.data.fecha);
  res.status(204).end();
});

gruposRouter.delete("/:id/miembros/:personalId", requirePermission("nomina", "capturar"), async (req, res) => {
  const fecha = typeof req.query.fecha === "string" ? req.query.fecha : new Date().toISOString().slice(0, 10);
  await quitarMiembroDeGrupo(unoSolo(req.params.id), unoSolo(req.params.personalId), fecha);
  res.status(204).end();
});
