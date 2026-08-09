import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { actualizarCuadrosSeccion, crearSeccionRiego, listarSeccionesRiego } from "./secciones-riego.js";

export const seccionesRiegoRouter = Router();
seccionesRiegoRouter.use(requireAuth);

seccionesRiegoRouter.get("/", requirePermission("unidades_produccion", "ver"), async (req, res) => {
  const huertaId = String(req.query.huertaId ?? "");
  if (!huertaId) {
    res.status(400).json({ error: "huertaId es requerido." });
    return;
  }
  res.json(await listarSeccionesRiego(huertaId));
});

const crearSchema = z.object({ huertaId: z.string().min(1), nombre: z.string().min(1), cuadroIds: z.array(z.string().min(1)) });

seccionesRiegoRouter.post("/", requirePermission("unidades_produccion", "capturar"), async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const seccion = await crearSeccionRiego(parsed.data.huertaId, parsed.data.nombre, parsed.data.cuadroIds);
  res.status(201).json(seccion);
});

const cuadrosSchema = z.object({ cuadroIds: z.array(z.string().min(1)) });

seccionesRiegoRouter.patch("/:id/cuadros", requirePermission("unidades_produccion", "editar"), async (req, res) => {
  const parsed = cuadrosSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await actualizarCuadrosSeccion(unoSolo(req.params.id), parsed.data.cuadroIds);
  res.status(204).end();
});
