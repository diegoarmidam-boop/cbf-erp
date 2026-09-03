import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { actualizarActivoCentroCosto, crearCentroCosto, listarCentrosCosto } from "./centrosCosto.js";

export const centrosCostoRouter = Router();
centrosCostoRouter.use(requireAuth);

// Acceso abierto a todo el que ve Compras — mismo criterio que el catálogo de Zonas.
centrosCostoRouter.get("/", requirePermission("compras", "ver"), async (req, res) => {
  res.json(await listarCentrosCosto(req.query.todas === "true"));
});

const nombreSchema = z.object({ nombre: z.string().min(1) });

centrosCostoRouter.post("/", requirePermission("compras", "ver"), async (req, res) => {
  const parsed = nombreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.status(201).json(await crearCentroCosto(parsed.data.nombre));
});

const activoSchema = z.object({ activo: z.boolean() });

centrosCostoRouter.patch("/:id/activo", requirePermission("compras", "ver"), async (req, res) => {
  const parsed = activoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await actualizarActivoCentroCosto(unoSolo(req.params.id), parsed.data.activo));
});
