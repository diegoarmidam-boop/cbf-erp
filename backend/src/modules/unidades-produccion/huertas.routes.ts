import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import type { Rol } from "@prisma/client";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorCaptura, mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import { actualizarHuerta, calcularAreaEfectivaHuerta, crearHuerta, eliminarHuertaCompleta, HuertaTieneNominaCerradaError, listarHuertas } from "./huertas.js";

// Borrar Huerta completa (25-ago-2026) es irreversible y afecta todo lo que
// cuelga de ella — a diferencia de desactivar (cualquiera con permiso de
// editar), solo Director General o Encargado de Sistemas pueden hacerlo.
const ROLES_ELIMINAR_HUERTA: Rol[] = ["director_general", "encargado_sistemas"];

export const huertasRouter = Router();
huertasRouter.use(requireAuth);

// `todas=true` para la pantalla de catálogo (para poder reactivar); el
// resto de selectores del sistema solo deben ofrecer Huertas activas.
huertasRouter.get("/", requirePermission("unidades_produccion", "ver"), async (req, res) => {
  if (req.query.todas === "true") {
    res.json(await prisma.huerta.findMany({ orderBy: { nombre: "asc" } }));
    return;
  }
  res.json(await listarHuertas());
});

huertasRouter.get("/:id/area-efectiva", requirePermission("unidades_produccion", "ver"), async (req, res) => {
  res.json(await calcularAreaEfectivaHuerta(unoSolo(req.params.id)));
});

const crearHuertaSchema = z.object({ nombre: z.string().min(1), hectareasTotales: z.number().positive() });

huertasRouter.post("/", requirePermission("unidades_produccion", "capturar"), async (req, res) => {
  const parsed = crearHuertaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  const huerta = await crearHuerta(parsed.data.nombre, parsed.data.hectareasTotales);
  res.status(201).json(huerta);
});

const actualizarSchema = z.object({
  nombre: z.string().min(1).optional(),
  hectareasTotales: z.number().positive().optional(),
  activo: z.boolean().optional(),
});

huertasRouter.patch("/:id", requirePermission("unidades_produccion", "editar"), async (req, res) => {
  const parsed = actualizarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  res.json(await actualizarHuerta(unoSolo(req.params.id), parsed.data));
});

const eliminarHuertaSchema = z.object({ confirmarNombre: z.string().min(1) });

// Borrado real e irreversible (25-ago-2026) — distinto del PATCH activo de
// arriba. Exige repetir el nombre exacto de la Huerta en el cuerpo de la
// petición, como segunda confirmación además del candado de rol — no es
// una validación de negocio, es una red de seguridad barata contra un
// clic equivocado o una llamada automatizada por error.
huertasRouter.delete("/:id", requirePermission("unidades_produccion", "editar"), async (req, res) => {
  if (!ROLES_ELIMINAR_HUERTA.includes(req.usuario!.rol)) {
    res.status(403).json({ error: "Solo Director General o Encargado de Sistemas pueden borrar una Huerta completa." });
    return;
  }
  const parsed = eliminarHuertaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const huerta = await prisma.huerta.findUniqueOrThrow({ where: { id: unoSolo(req.params.id) } });
    if (parsed.data.confirmarNombre.trim() !== huerta.nombre) {
      res.status(400).json({ error: "El nombre no coincide — escribe exactamente el nombre de la Huerta para confirmar." });
      return;
    }
    await eliminarHuertaCompleta(unoSolo(req.params.id));
    res.status(204).end();
  } catch (err) {
    if (err instanceof HuertaTieneNominaCerradaError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: mensajeErrorCaptura(err) });
      return;
    }
    throw err;
  }
});

// Mapa/croquis: capa visual de referencia, sin geometría estructurada (9.1).
const MAPAS_DIR = path.resolve("uploads", "huertas");
fs.mkdirSync(MAPAS_DIR, { recursive: true });
const uploadMapa = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MAPAS_DIR),
    filename: (req, file, cb) => cb(null, `${unoSolo(req.params.id)}-${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

huertasRouter.post("/:id/mapa", requirePermission("unidades_produccion", "editar"), uploadMapa.single("mapa"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Falta el archivo del mapa." });
    return;
  }
  const mapaUrl = `/uploads/huertas/${req.file.filename}`;
  const huerta = await actualizarHuerta(unoSolo(req.params.id), { mapaUrl });
  res.json(huerta);
});
