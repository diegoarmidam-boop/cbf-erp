import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { matrizAsistencia, registrarFaltaInjustificada, quitarFaltaInjustificada, tiraAsistenciaPersona } from "./asistencia.js";

export const asistenciaRouter = Router();
asistenciaRouter.use(requireAuth);

// Matriz de Asistencia (V1 P6, 27-sep-2026, 9.11f) — registrada ANTES de
// "/:personalId" o Express interpretaría "matriz" como un personalId.
asistenciaRouter.get("/matriz", requirePermission("nomina", "ver"), async (req, res) => {
  const { fechaIni, fechaFin } = req.query as { fechaIni?: string; fechaFin?: string };
  if (!fechaIni || !fechaFin) {
    res.status(400).json({ error: "fechaIni y fechaFin son requeridos." });
    return;
  }
  const alcance = huertaIdDeAlcance(req);
  const huertaId = alcance ?? (typeof req.query.huertaId === "string" ? req.query.huertaId : undefined);
  res.json(await matrizAsistencia(fechaIni, fechaFin, huertaId));
});

asistenciaRouter.get("/:personalId", requirePermission("nomina", "ver"), async (req, res) => {
  const { fechaIni, fechaFin } = req.query as { fechaIni?: string; fechaFin?: string };
  if (!fechaIni || !fechaFin) {
    res.status(400).json({ error: "fechaIni y fechaFin son requeridos." });
    return;
  }
  res.json(await tiraAsistenciaPersona(unoSolo(req.params.personalId), fechaIni, fechaFin));
});

const faltaSchema = z.object({ fecha: z.string(), notas: z.string().optional() });

asistenciaRouter.post("/:personalId/falta", requirePermission("nomina", "editar"), async (req, res) => {
  const parsed = faltaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const falta = await registrarFaltaInjustificada(
    unoSolo(req.params.personalId),
    parsed.data.fecha,
    req.usuario!.usuarioId,
    parsed.data.notas
  );
  res.status(201).json(falta);
});

asistenciaRouter.delete("/:personalId/falta", requirePermission("nomina", "editar"), async (req, res) => {
  const fecha = typeof req.query.fecha === "string" ? req.query.fecha : "";
  if (!fecha) {
    res.status(400).json({ error: "fecha es requerida." });
    return;
  }
  await quitarFaltaInjustificada(unoSolo(req.params.personalId), fecha);
  res.status(204).end();
});
