import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorCaptura, mensajeErrorValidacion } from "../../core/http.js";
import {
  AsignacionInvalidaError,
  generarOrdenesDesdeAsignaciones,
  listarPorProducto,
  listarPorProgramacion,
  listarPorProveedor,
  TopeDisponibleExcedidoError,
  validarYAgruparAsignaciones,
} from "./ordenesGeneracion.js";

export const ordenesGeneracionRouter = Router();
ordenesGeneracionRouter.use(requireAuth);

ordenesGeneracionRouter.get("/por-programacion", requirePermission("compras", "ver"), async (req, res) => {
  const referenciaAplicacionId = typeof req.query.referenciaAplicacionId === "string" ? req.query.referenciaAplicacionId : null;
  const ordenCompraIdManual = typeof req.query.ordenCompraIdManual === "string" ? req.query.ordenCompraIdManual : null;
  res.json(await listarPorProgramacion(referenciaAplicacionId, ordenCompraIdManual));
});

ordenesGeneracionRouter.get("/por-producto/:clave", requirePermission("compras", "ver"), async (req, res) => {
  res.json(await listarPorProducto(req.params.clave as string));
});

ordenesGeneracionRouter.get("/por-proveedor/:proveedorId", requirePermission("compras", "ver"), async (req, res) => {
  res.json(await listarPorProveedor(req.params.proveedorId as string));
});

const asignacionSchema = z.object({
  cotizacionId: z.string().min(1),
  ordenCompraId: z.string().min(1),
  cantidad: z.number().positive(),
});
const asignacionesSchema = z.object({ asignaciones: z.array(asignacionSchema).min(1) });

function manejarErrorAsignacion(err: unknown, res: import("express").Response) {
  if (err instanceof TopeDisponibleExcedidoError) {
    res.status(409).json({ error: err.message, detalle: err.detalle });
    return;
  }
  if (err instanceof AsignacionInvalidaError) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(400).json({ error: mensajeErrorCaptura(err) });
}

// Vista previa (1.2): agrupa por Proveedor resultante y valida el tope de
// disponible, sin escribir nada — para el "esto va a generar N órdenes..."
// antes de aceptar.
ordenesGeneracionRouter.post("/vista-previa", requirePermission("compras", "ver"), async (req, res) => {
  const parsed = asignacionesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.json(await validarYAgruparAsignaciones(parsed.data.asignaciones));
  } catch (err) {
    manejarErrorAsignacion(err, res);
  }
});

ordenesGeneracionRouter.post("/generar", requirePermission("compras", "capturar"), async (req, res) => {
  const parsed = asignacionesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const ordenes = await generarOrdenesDesdeAsignaciones(parsed.data.asignaciones, req.usuario!.usuarioId);
    res.status(201).json(ordenes);
  } catch (err) {
    manejarErrorAsignacion(err, res);
  }
});
