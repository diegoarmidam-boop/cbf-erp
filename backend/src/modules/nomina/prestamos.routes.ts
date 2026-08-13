import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import { obtenerConfigNomina } from "./config.js";
import { calcularPeriodoNomina, hoyISO } from "@cbf/shared";
import { aplicarDescuento, cancelarPrestamo, crearPrestamo, historialPrestamo, listarPrestamos, PrestamoConDescuentosError } from "./prestamos.js";

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
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const prestamo = await crearPrestamo(parsed.data);
  res.status(201).json(prestamo);
});

prestamosRouter.get("/:id/historial", requirePermission("nomina", "ver"), async (req, res) => {
  res.json(await historialPrestamo(unoSolo(req.params.id)));
});

// Periodo de nómina vigente hoy — el frontend lo usa para pintar cada fila
// de la tabla de préstamos como "pendiente" (resaltada) o "ya aplicada este
// periodo" (neutral), y para saber si aplicar ahora sería adelantar (9.11).
prestamosRouter.get("/periodo-actual", requirePermission("nomina", "ver"), async (_req, res) => {
  const config = await obtenerConfigNomina();
  res.json(calcularPeriodoNomina(hoyISO(), config.diaCorteIndex));
});

// Aplicar el descuento exige revisar y confirmar explícitamente — nunca es
// automático (bloque 9.11). El periodo se calcula a partir del
// proximoDescuento del propio préstamo (no de "hoy"): así, si ya se aplicó
// el de este periodo y se vuelve a picar el botón (adelantar), el nuevo
// registro queda estampado con el periodo SIGUIENTE en vez de duplicar el
// mismo periodoFin — evita que el Reporte semanal se confunda entre "cuál
// aplicación corresponde a cuál periodo".
prestamosRouter.post("/:id/aplicar-descuento", requirePermission("nomina", "editar"), async (req, res) => {
  const id = unoSolo(req.params.id);
  const prestamo = await prisma.prestamo.findUniqueOrThrow({ where: { id } });
  const config = await obtenerConfigNomina();
  const periodo = calcularPeriodoNomina(prestamo.proximoDescuento.toISOString().slice(0, 10), config.diaCorteIndex);
  const monto = await aplicarDescuento(id, req.usuario!.usuarioId, periodo.fin);
  res.json({ montoAplicado: monto });
});

prestamosRouter.post("/:id/cancelar", requirePermission("nomina", "editar"), async (req, res) => {
  try {
    res.json(await cancelarPrestamo(unoSolo(req.params.id)));
  } catch (err) {
    if (err instanceof PrestamoConDescuentosError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
