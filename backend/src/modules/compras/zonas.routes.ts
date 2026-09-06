import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireDirectorOSistemas, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { actualizarActivoZona, crearZona, editarZona, listarZonas } from "./zonas.js";

export const zonasRouter = Router();
zonasRouter.use(requireAuth);

// Acceso abierto a todo el que ve Compras (9.14, 29-ago-2026) — mismo
// criterio "sin restricción adicional" que el resto del Comparador.
zonasRouter.get("/", requirePermission("compras", "ver"), async (req, res) => {
  res.json(await listarZonas(req.query.todas === "true"));
});

const zonaSchema = z.object({
  nombre: z.string().min(1),
  costoFleteKg: z.number().nonnegative(),
  esZonaComprador: z.boolean().optional(),
});

zonasRouter.post("/", requirePermission("compras", "ver"), async (req, res) => {
  const parsed = zonaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.status(201).json(await crearZona(parsed.data));
});

const editarZonaSchema = zonaSchema.partial();

// Editar o desactivar/reactivar una Zona ya existente es exclusivo de
// Configuración → Catálogos (Prioridad 6, 4-sep-2026) — antes vivía aquí
// mismo, con acceso abierto a todo Compras (ZonasPanel en Proveedores.tsx).
zonasRouter.patch("/:id", requireDirectorOSistemas, async (req, res) => {
  const parsed = editarZonaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await editarZona(unoSolo(req.params.id), parsed.data));
});

const activoSchema = z.object({ activo: z.boolean() });

zonasRouter.patch("/:id/activo", requireDirectorOSistemas, async (req, res) => {
  const parsed = activoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await actualizarActivoZona(unoSolo(req.params.id), parsed.data.activo));
});
