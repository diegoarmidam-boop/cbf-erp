import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { avanzarEtapa, cerrarCiclo, crearCiclo, listarCiclos, SuperficieExcedeCuadroError, YaHayCicloActivoError } from "./ciclos.js";

export const ciclosRouter = Router();
ciclosRouter.use(requireAuth);

ciclosRouter.get("/", requirePermission("unidades_produccion", "ver"), async (req, res) => {
  const huertaId = String(req.query.huertaId ?? "");
  if (!huertaId) {
    res.status(400).json({ error: "huertaId es requerido." });
    return;
  }
  res.json(await listarCiclos(huertaId));
});

const variedadSchema = z.object({
  cuadroId: z.string().min(1),
  variedad: z.string().min(1),
  hectareas: z.number().positive(),
  porcentaje: z.number().min(0).max(100).optional(),
});

const crearCicloSchema = z.object({
  huertaId: z.string().min(1),
  tipo: z.enum(["cultivo", "descanso", "prueba"]),
  fechaInicio: z.string(),
  variedades: z.array(variedadSchema),
});

ciclosRouter.post("/", requirePermission("unidades_produccion", "capturar"), async (req, res) => {
  const parsed = crearCicloSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const ciclo = await crearCiclo(parsed.data.huertaId, parsed.data.tipo, parsed.data.fechaInicio, parsed.data.variedades);
    res.status(201).json(ciclo);
  } catch (err) {
    if (err instanceof YaHayCicloActivoError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof SuperficieExcedeCuadroError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const etapaSchema = z.object({ etapa: z.enum(["preparacion_suelo", "desarrollo", "cosecha_empaque", "post_cosecha"]) });

ciclosRouter.post("/:id/avanzar-etapa", requirePermission("unidades_produccion", "editar"), async (req, res) => {
  const parsed = etapaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(await avanzarEtapa(unoSolo(req.params.id), parsed.data.etapa));
});

ciclosRouter.post("/:id/cerrar", requirePermission("unidades_produccion", "editar"), async (req, res) => {
  res.json(await cerrarCiclo(unoSolo(req.params.id)));
});
