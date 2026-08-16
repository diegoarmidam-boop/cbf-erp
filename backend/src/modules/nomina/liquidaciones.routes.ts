import { Router } from "express";
import { z } from "zod";
import { hoyISO } from "@cbf/shared";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import {
  calcularLiquidacion,
  crearLiquidacion,
  generarPdfLiquidacion,
  listarLiquidaciones,
  PersonaNoEsDestajoError,
  rangoDefaultLiquidacion,
  reactivarDisponibilidad,
} from "./liquidaciones.js";

export const liquidacionesRouter = Router();
liquidacionesRouter.use(requireAuth);

// Permisos (9.11): mismo grupo que ya tiene "capturar" en Nómina — Director
// General, Recursos Humanos, Encargado de Nóminas.
liquidacionesRouter.get("/", requirePermission("nomina", "capturar"), async (_req, res) => {
  res.json(await listarLiquidaciones());
});

liquidacionesRouter.get("/rango-default", requirePermission("nomina", "capturar"), async (_req, res) => {
  res.json(await rangoDefaultLiquidacion(hoyISO()));
});

const calcularSchema = z.object({
  personalId: z.string().min(1),
  fechaInicio: z.string(),
  fechaFin: z.string(),
});

liquidacionesRouter.post("/calcular", requirePermission("nomina", "capturar"), async (req, res) => {
  const parsed = calcularSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.json(await calcularLiquidacion(parsed.data.personalId, parsed.data.fechaInicio, parsed.data.fechaFin));
  } catch (err) {
    if (err instanceof PersonaNoEsDestajoError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const crearSchema = z.object({
  personalId: z.string().min(1),
  fechaInicio: z.string(),
  fechaFin: z.string(),
  prestamosADescontar: z.array(z.string()).default([]),
});

liquidacionesRouter.post("/", requirePermission("nomina", "capturar"), async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const liquidacion = await crearLiquidacion(parsed.data, req.usuario!.usuarioId);
    res.status(201).json(liquidacion);
  } catch (err) {
    if (err instanceof PersonaNoEsDestajoError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

liquidacionesRouter.get("/:id/pdf", requirePermission("nomina", "capturar"), async (req, res) => {
  const doc = await generarPdfLiquidacion(unoSolo(req.params.id));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="liquidacion-${unoSolo(req.params.id)}.pdf"`);
  doc.pipe(res);
  doc.end();
});

const reactivarSchema = z.object({ personalId: z.string().min(1) });

liquidacionesRouter.post("/reactivar-disponibilidad", requirePermission("nomina", "capturar"), async (req, res) => {
  const parsed = reactivarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await reactivarDisponibilidad(parsed.data.personalId));
});
