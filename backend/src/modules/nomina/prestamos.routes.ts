import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { obtenerConfigNomina } from "./config.js";
import { calcularPeriodoNomina } from "@cbf/shared";
import { aplicarDescuento, crearPrestamo, historialPrestamo, listarPrestamos } from "./prestamos.js";

export const prestamosRouter = Router();
prestamosRouter.use(requireAuth);

prestamosRouter.get("/", requirePermission("nomina", "ver"), async (req, res) => {
  const personalId = typeof req.query.personalId === "string" ? req.query.personalId : undefined;
  const activo = req.query.activo === "true" ? true : req.query.activo === "false" ? false : undefined;
  res.json(await listarPrestamos({ personalId, activo }));
});

const nuevoSchema = z.object({
  personalId: z.string().min(1),
  montoTotal: z.number().positive(),
  motivo: z.string().min(1),
  periodicidad: z.enum(["semanal", "quincenal"]),
  montoPorDescuento: z.number().positive(),
  fechaPrimerDescuento: z.string(),
});

prestamosRouter.post("/", requirePermission("nomina", "capturar"), async (req, res) => {
  const parsed = nuevoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const prestamo = await crearPrestamo(parsed.data);
  res.status(201).json(prestamo);
});

prestamosRouter.get("/:id/historial", requirePermission("nomina", "ver"), async (req, res) => {
  res.json(await historialPrestamo(unoSolo(req.params.id)));
});

// Aplicar el descuento exige revisar y confirmar explícitamente — nunca es
// automático (bloque 9.11).
prestamosRouter.post("/:id/aplicar-descuento", requirePermission("nomina", "editar"), async (req, res) => {
  const config = await obtenerConfigNomina();
  const periodo = calcularPeriodoNomina(new Date().toISOString().slice(0, 10), config.diaCorteIndex);
  const monto = await aplicarDescuento(unoSolo(req.params.id), req.usuario!.usuarioId, periodo.fin);
  res.json({ montoAplicado: monto });
});
