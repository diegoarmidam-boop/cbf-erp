import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorCaptura, mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import {
  agregarCotizaciones,
  ComparacionConComprasError,
  crearComparacion,
  eliminarComparacion,
  eliminarCotizacion,
  listarComparaciones,
  obtenerComparacionCalculada,
  obtenerComparacionDeOrden,
  OrdenNoPendienteDeCotizarError,
  YaTieneComparacionError,
} from "./comparador.js";

export const comparadorRouter = Router();
comparadorRouter.use(requireAuth);

// Acceso abierto a todo el que ve Compras (9.14/4.5) — sin restricción adicional.
comparadorRouter.get("/", requirePermission("compras", "ver"), async (_req, res) => {
  res.json(await listarComparaciones());
});

comparadorRouter.get("/por-orden/:ordenCompraId", requirePermission("compras", "ver"), async (req, res) => {
  const comparacion = await obtenerComparacionDeOrden(unoSolo(req.params.ordenCompraId));
  res.json(comparacion);
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
    cantidadDisponibleTotal: z.boolean(),
    cantidadDisponible: z.number().positive().optional(),
  })
  .refine((c) => c.moneda !== "USD" || c.tipoCambio != null, { message: "Falta el tipo de cambio para una cotización en USD.", path: ["tipoCambio"] })
  .refine((c) => c.cantidadDisponibleTotal || c.cantidadDisponible != null, {
    message: 'Marca "Cantidad total disponible" o captura la cantidad exacta.',
    path: ["cantidadDisponible"],
  });

const crearSchema = z.object({
  ordenCompraId: z.string().min(1),
  umbralExcedentePct: z.number().positive().optional(),
  cotizaciones: z.array(cotizacionSchema).min(1),
});

comparadorRouter.post("/", requirePermission("compras", "ver"), async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const comparacion = await crearComparacion(parsed.data, req.usuario!.usuarioId);
    res.status(201).json(comparacion);
  } catch (err) {
    if (err instanceof OrdenNoPendienteDeCotizarError || err instanceof YaTieneComparacionError) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: mensajeErrorCaptura(err) });
  }
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
  try {
    await eliminarCotizacion(unoSolo(req.params.cotizacionId));
    res.status(204).end();
  } catch (err) {
    if (err instanceof ComparacionConComprasError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

comparadorRouter.delete("/:id", requirePermission("compras", "ver"), async (req, res) => {
  try {
    await eliminarComparacion(unoSolo(req.params.id));
    res.status(204).end();
  } catch (err) {
    if (err instanceof ComparacionConComprasError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
