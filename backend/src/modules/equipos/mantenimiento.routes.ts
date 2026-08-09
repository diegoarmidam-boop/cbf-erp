import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import { alertasMantenimiento, crearConcepto, listarConceptos, listarEventos, registrarEvento } from "./mantenimiento.js";

export const mantenimientoRouter = Router();
mantenimientoRouter.use(requireAuth);

mantenimientoRouter.get("/:equipoId/conceptos", requirePermission("equipos", "ver"), async (req, res) => {
  res.json(await listarConceptos(unoSolo(req.params.equipoId)));
});

const conceptoSchema = z.object({ nombre: z.string().min(1), umbralHoras: z.number().positive() });

mantenimientoRouter.post("/:equipoId/conceptos", requirePermission("equipos", "capturar"), async (req, res) => {
  const parsed = conceptoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.status(201).json(await crearConcepto(unoSolo(req.params.equipoId), parsed.data.nombre, parsed.data.umbralHoras));
});

// Solo se puede borrar un concepto que nunca se usó en un evento de
// mantenimiento — si ya tiene MantenimientoEvento ligado, el historial
// depende de él.
mantenimientoRouter.delete("/conceptos/:id", requirePermission("equipos", "capturar"), async (req, res) => {
  const id = unoSolo(req.params.id);
  const enUso = await prisma.mantenimientoEvento.findFirst({ where: { conceptoId: id } });
  if (enUso) {
    res.status(409).json({ error: "Este concepto ya tiene eventos de mantenimiento registrados — no se puede borrar." });
    return;
  }
  await prisma.mantenimientoConcepto.delete({ where: { id } });
  res.status(204).end();
});

mantenimientoRouter.get("/:equipoId/alertas", requirePermission("equipos", "ver"), async (req, res) => {
  res.json(await alertasMantenimiento(unoSolo(req.params.equipoId)));
});

mantenimientoRouter.get("/:equipoId/eventos", requirePermission("equipos", "ver"), async (req, res) => {
  res.json(await listarEventos(unoSolo(req.params.equipoId)));
});

const eventoSchema = z.object({
  tipo: z.enum(["preventivo", "correctivo"]),
  conceptoId: z.string().optional(),
  descripcion: z.string().min(1),
  mecanicoInterno: z.boolean(),
  costo: z.number().nonnegative().optional(),
  fecha: z.string(),
});

mantenimientoRouter.post("/:equipoId/eventos", requirePermission("equipos", "capturar"), async (req, res) => {
  const parsed = eventoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.status(201).json(await registrarEvento(unoSolo(req.params.equipoId), parsed.data));
});
