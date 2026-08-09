import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, requirePermissionAny } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import {
  autorizarOrden,
  cotizarOrden,
  crearOrdenManual,
  listarOrdenes,
  ProductoNoAutorizadoError,
  recibirOrden,
  rechazarOrden,
  SolicitudYaResueltaOrdenError,
  TransicionInvalidaError,
} from "./ordenes.js";

export const ordenesRouter = Router();
ordenesRouter.use(requireAuth);

ordenesRouter.get("/", requirePermission("compras", "ver"), async (req, res) => {
  const estado = typeof req.query.estado === "string" ? req.query.estado : undefined;
  res.json(await listarOrdenes(estado));
});

const crearSchema = z.object({ productoId: z.string().min(1), cantidadSolicitada: z.number().positive() });

ordenesRouter.post("/", requirePermission("compras", "capturar"), async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

const cotizarSchema = z.object({ proveedorId: z.string().min(1), precioUnitario: z.number().positive(), fechaEsperada: z.string().optional() });

ordenesRouter.post("/:id/cotizar", requirePermission("compras", "capturar"), async (req, res) => {
  const parsed = cotizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const orden = await cotizarOrden(unoSolo(req.params.id), parsed.data.proveedorId, parsed.data.precioUnitario, parsed.data.fechaEsperada);
    res.json(orden);
  } catch (err) {
    if (err instanceof TransicionInvalidaError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const recibirSchema = z.object({ cantidadRecibida: z.number().positive(), lote: z.string().optional(), fechaCaducidad: z.string().optional() });

// Recibir es, físicamente, una acción de Almacén ("Almacén la recibe" —
// 9.14/9.15) aunque viva en el ciclo de la orden de Compras — se acepta
// cualquiera de los dos permisos.
ordenesRouter.post("/:id/recibir", requirePermissionAny(["compras", "capturar"], ["almacen", "capturar"]), async (req, res) => {
  const parsed = recibirSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const orden = await recibirOrden(unoSolo(req.params.id), parsed.data.cantidadRecibida, req.usuario!.usuarioId, {
      lote: parsed.data.lote,
      fechaCaducidad: parsed.data.fechaCaducidad,
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
