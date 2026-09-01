import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import {
  agregarCotizaciones,
  crearComparacion,
  eliminarComparacion,
  eliminarCotizacion,
  listarComparaciones,
  obtenerComparacionCalculada,
} from "./comparador.js";

export const comparadorRouter = Router();
comparadorRouter.use(requireAuth);

// Acceso abierto a todo el que ve Compras (9.14) — sin restricción adicional, a diferencia de autorizar/formalizar.
comparadorRouter.get("/", requirePermission("compras", "ver"), async (_req, res) => {
  res.json(await listarComparaciones());
});

comparadorRouter.get("/:id", requirePermission("compras", "ver"), async (req, res) => {
  const comparacion = await obtenerComparacionCalculada(unoSolo(req.params.id));
  if (!comparacion) {
    res.status(404).json({ error: "No encontrada." });
    return;
  }
  res.json(comparacion);
});

const cotizacionSchema = z
  .object({
    proveedorId: z.string().min(1),
    zonaId: z.string().min(1),
    nombreComercial: z.string().min(1),
    moneda: z.enum(["MXN", "USD"]),
    precioValor: z.number().positive(),
    tipoCambio: z.number().positive().optional(),
    presentacionCantidad: z.number().positive(),
  })
  .refine((c) => c.moneda !== "USD" || c.tipoCambio != null, { message: "Falta el tipo de cambio para una cotización en USD.", path: ["tipoCambio"] });

const crearSchema = z.object({
  productoId: z.string().min(1),
  cantidadNecesaria: z.number().positive(),
  unidad: z.string().min(1),
  umbralExcedentePct: z.number().positive().optional(),
  cotizaciones: z.array(cotizacionSchema).min(1),
});

comparadorRouter.post("/", requirePermission("compras", "ver"), async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const comparacion = await crearComparacion(parsed.data, req.usuario!.usuarioId);
  res.status(201).json(comparacion);
});

const agregarCotizacionesSchema = z.object({ cotizaciones: z.array(cotizacionSchema).min(1) });

comparadorRouter.post("/:id/cotizaciones", requirePermission("compras", "ver"), async (req, res) => {
  const parsed = agregarCotizacionesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  await agregarCotizaciones(unoSolo(req.params.id), parsed.data.cotizaciones);
  res.status(201).json(await obtenerComparacionCalculada(unoSolo(req.params.id)));
});

comparadorRouter.delete("/:id/cotizaciones/:cotizacionId", requirePermission("compras", "ver"), async (req, res) => {
  await eliminarCotizacion(unoSolo(req.params.cotizacionId));
  res.status(204).end();
});

comparadorRouter.delete("/:id", requirePermission("compras", "ver"), async (req, res) => {
  await eliminarComparacion(unoSolo(req.params.id));
  res.status(204).end();
});
