import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { crearComparacion, eliminarComparacion, listarComparaciones, obtenerComparacionCalculada } from "./comparador.js";

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

const cotizacionSchema = z.object({
  proveedorId: z.string().min(1),
  precioPresentacion: z.number().positive(),
  cantidadPresentacion: z.number().positive(),
  unidadPresentacion: z.string().min(1),
});

const itemSchema = z.object({
  productoId: z.string().min(1),
  cantidadNecesaria: z.number().positive(),
  unidad: z.string().min(1),
  cotizaciones: z.array(cotizacionSchema).min(1),
});

const crearSchema = z.object({
  nombre: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

comparadorRouter.post("/", requirePermission("compras", "ver"), async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const comparacion = await crearComparacion(parsed.data.nombre, req.usuario!.usuarioId, parsed.data.items);
  res.status(201).json(comparacion);
});

comparadorRouter.delete("/:id", requirePermission("compras", "ver"), async (req, res) => {
  await eliminarComparacion(unoSolo(req.params.id));
  res.status(204).end();
});
