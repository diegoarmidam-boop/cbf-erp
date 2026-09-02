import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, requirePermissionAny } from "../../middleware/auth.js";
import { mensajeErrorCaptura, mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import { opcionesRecepcionDeProducto } from "../almacen/preferencias.js";
import {
  autorizarOrden,
  crearOrdenManual,
  listarOrdenes,
  listarPendientesPorIngredienteActivo,
  marcarOrdenPagada,
  ProductoNoAutorizadoError,
  recibirOrden,
  rechazarOrden,
  SolicitudYaResueltaOrdenError,
  TransicionInvalidaError,
} from "./ordenes.js";
import { generarPdfOrdenCompra, obtenerOrdenCompraParaPdf } from "./ordenCompraPdf.js";

export const ordenesRouter = Router();
ordenesRouter.use(requireAuth);

ordenesRouter.get("/pendientes-por-ingrediente-activo", requirePermission("compras", "ver"), async (_req, res) => {
  res.json(await listarPendientesPorIngredienteActivo());
});

ordenesRouter.get("/", requirePermission("compras", "ver"), async (req, res) => {
  const estado = typeof req.query.estado === "string" ? req.query.estado : undefined;
  res.json(await listarOrdenes(estado, req.query.incluirCerradas === "true"));
});

const crearSchema = z.object({ productoId: z.string().min(1), cantidadSolicitada: z.number().positive() });

ordenesRouter.post("/", requirePermission("compras", "capturar"), async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const orden = await crearOrdenManual(parsed.data.productoId, parsed.data.cantidadSolicitada, req.usuario!.usuarioId);
    res.status(201).json(orden);
  } catch (err) {
    if (err instanceof ProductoNoAutorizadoError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

ordenesRouter.post("/:id/autorizar", requirePermission("compras", "autoriza"), async (req, res) => {
  try {
    res.json(await autorizarOrden(unoSolo(req.params.id), req.usuario!.usuarioId));
  } catch (err) {
    if (err instanceof SolicitudYaResueltaOrdenError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const rechazarSchema = z.object({ motivoRechazo: z.string().optional() });

ordenesRouter.post("/:id/rechazar", requirePermission("compras", "autoriza"), async (req, res) => {
  const parsed = rechazarSchema.safeParse(req.body);
  try {
    res.json(await rechazarOrden(unoSolo(req.params.id), req.usuario!.usuarioId, parsed.success ? parsed.data.motivoRechazo : undefined));
  } catch (err) {
    if (err instanceof SolicitudYaResueltaOrdenError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// CxP (9.14): confirmación manual de pago — Encargado de Compras (editar) o quien autoriza gasto (Gerencia/Director).
ordenesRouter.post("/:id/marcar-pagada", requirePermissionAny(["compras", "editar"], ["compras", "autoriza"]), async (req, res) => {
  res.json(await marcarOrdenPagada(unoSolo(req.params.id)));
});

// Opciones para confirmar "qué producto llegó de verdad" al recibir (2.3, 2-sep-2026).
ordenesRouter.get(
  "/:id/opciones-recepcion",
  requirePermissionAny(["compras", "capturar"], ["almacen", "capturar"]),
  async (req, res) => {
    const orden = await prisma.ordenCompra.findUnique({ where: { id: unoSolo(req.params.id) }, select: { productoId: true } });
    if (!orden) {
      res.status(404).json({ error: "Orden no encontrada." });
      return;
    }
    res.json(await opcionesRecepcionDeProducto(orden.productoId));
  }
);

const recibirSchema = z.object({
  cantidadRecibida: z.number().positive(),
  lote: z.string().optional(),
  fechaCaducidad: z.string().optional(),
  productoRecibidoId: z.string().min(1),
});

// Recibir es, físicamente, una acción de Almacén ("Almacén la recibe" —
// 9.14/9.15) aunque viva en el ciclo de la orden de Compras — se acepta
// cualquiera de los dos permisos.
ordenesRouter.post("/:id/recibir", requirePermissionAny(["compras", "capturar"], ["almacen", "capturar"]), async (req, res) => {
  const parsed = recibirSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const orden = await recibirOrden(unoSolo(req.params.id), parsed.data.cantidadRecibida, req.usuario!.usuarioId, {
      lote: parsed.data.lote,
      fechaCaducidad: parsed.data.fechaCaducidad,
      productoRecibidoId: parsed.data.productoRecibidoId,
    });
    res.json(orden);
  } catch (err) {
    if (err instanceof TransicionInvalidaError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Orden de Compra en PDF (3.1, 2-sep-2026) — solo tiene sentido para
// órdenes ya "generada"/"recibida"/"cubierta" (tienen folio asignado).
ordenesRouter.get("/:id/orden-compra.pdf", requirePermission("compras", "ver"), async (req, res) => {
  try {
    const orden = await obtenerOrdenCompraParaPdf(unoSolo(req.params.id));
    const doc = generarPdfOrdenCompra(orden);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="orden-compra-${orden.numero ?? unoSolo(req.params.id)}.pdf"`);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
});
