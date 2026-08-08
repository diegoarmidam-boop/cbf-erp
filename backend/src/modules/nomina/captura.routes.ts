import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import {
  CapturaInvalidaError,
  DiaCerradoError,
  guardarCapturaDelDia,
  obtenerCapturaDelDia,
  obtenerSugerenciaDesdeAyer,
  diaEstaCerrado,
} from "./captura.js";

export const capturaRouter = Router();
capturaRouter.use(requireAuth);

function verificarAlcanceHuerta(req: Parameters<Parameters<typeof capturaRouter.get>[1]>[0], res: Parameters<Parameters<typeof capturaRouter.get>[1]>[1]): boolean {
  const alcance = huertaIdDeAlcance(req);
  if (alcance && alcance !== req.params.huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return false;
  }
  return true;
}

capturaRouter.get("/:huertaId/:fecha", requirePermission("nomina", "capturar"), async (req, res) => {
  if (!verificarAlcanceHuerta(req, res)) return;
  const { huertaId, fecha } = req.params as { huertaId: string; fecha: string };

  const [registros, cerrado] = await Promise.all([obtenerCapturaDelDia(huertaId, fecha), diaEstaCerrado(huertaId, fecha)]);
  const sugerencia = registros.length === 0 && !cerrado ? await obtenerSugerenciaDesdeAyer(huertaId, fecha) : [];
  res.json({ registros, cerrado, sugerencia });
});

const filaSchema = z.object({
  tipo: z.enum(["individual", "grupal"]),
  personalId: z.string().optional(),
  grupoId: z.string().optional(),
  actividadId: z.string().min(1),
  cuadroId: z.string().optional(),
  cantidad: z.number(),
});

const guardarSchema = z.object({ filas: z.array(filaSchema) });

capturaRouter.post("/:huertaId/:fecha", requirePermission("nomina", "capturar"), async (req, res) => {
  if (!verificarAlcanceHuerta(req, res)) return;
  const { huertaId, fecha } = req.params as { huertaId: string; fecha: string };

  const parsed = guardarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    await guardarCapturaDelDia(huertaId, fecha, parsed.data.filas, req.usuario!.usuarioId);
    res.status(204).end();
  } catch (err) {
    if (err instanceof DiaCerradoError) {
      res.status(423).json({ error: err.message });
      return;
    }
    if (err instanceof CapturaInvalidaError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});
