import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import {
  actualizarCamposPersonalizados,
  actualizarConfiguracionCuadro,
  cambiarEstatusCuadro,
  crearCuadro,
  listarCuadros,
  plantasTotalesVigentes,
} from "./cuadros.js";

export const cuadrosRouter = Router();
cuadrosRouter.use(requireAuth);

cuadrosRouter.get("/", requirePermission("unidades_produccion", "ver"), async (req, res) => {
  const huertaId = String(req.query.huertaId ?? "");
  if (!huertaId) {
    res.status(400).json({ error: "huertaId es requerido." });
    return;
  }
  const cuadros = await listarCuadros(huertaId);
  const conPlantas = await Promise.all(
    cuadros.map(async (c) => ({ ...c, plantasTotales: await plantasTotalesVigentes(c.id) }))
  );
  res.json(conPlantas);
});

const versionSchema = z.object({
  hectareas: z.number().positive(),
  tipoSuelo: z.string().optional(),
  fechaSiembra: z.string().optional(),
  distSurcosM: z.number().positive().optional(),
  distPlantasM: z.number().positive().optional(),
});

const crearCuadroSchema = z.object({
  huertaId: z.string().min(1),
  nombre: z.string().min(1),
  vigenteDesde: z.string(),
  version: versionSchema,
});

cuadrosRouter.post("/", requirePermission("unidades_produccion", "capturar"), async (req, res) => {
  const parsed = crearCuadroSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { huertaId, nombre, vigenteDesde, version } = parsed.data;
  const cuadro = await crearCuadro(huertaId, nombre, version, vigenteDesde);
  res.status(201).json(cuadro);
});

const nuevaVersionSchema = z.object({ vigenteDesde: z.string(), version: versionSchema });

cuadrosRouter.post("/:id/version", requirePermission("unidades_produccion", "editar"), async (req, res) => {
  const parsed = nuevaVersionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const version = await actualizarConfiguracionCuadro(unoSolo(req.params.id), parsed.data.version, parsed.data.vigenteDesde);
  res.status(201).json(version);
});

cuadrosRouter.patch("/:id/campos-personalizados", requirePermission("unidades_produccion", "editar"), async (req, res) => {
  const parsed = z.record(z.string(), z.unknown()).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(await actualizarCamposPersonalizados(unoSolo(req.params.id), parsed.data));
});

const estatusSchema = z.object({ estatus: z.enum(["activo", "en_descanso", "fuera_produccion"]) });

cuadrosRouter.patch("/:id/estatus", requirePermission("unidades_produccion", "editar"), async (req, res) => {
  const parsed = estatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(await cambiarEstatusCuadro(unoSolo(req.params.id), parsed.data.estatus));
});
