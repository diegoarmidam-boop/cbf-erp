import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import { actualizarHuerta, calcularAreaEfectivaHuerta, crearHuerta, listarHuertas } from "./huertas.js";

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
    res.status(400).json({ error: parsed.error.message });
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
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(await actualizarHuerta(unoSolo(req.params.id), parsed.data));
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
