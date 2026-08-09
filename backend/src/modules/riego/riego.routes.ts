import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import { fertirriegoActivoDeSeccion, FertirriegoNoActivoError, historialRiego, obtenerRiegoDiario, registrarRiegoDiario } from "./riego.js";

export const riegoRouter = Router();
riegoRouter.use(requireAuth);

async function verificarAlcanceSeccion(req: Request, res: Response, seccionId: string): Promise<boolean> {
  const alcance = huertaIdDeAlcance(req);
  if (!alcance) return true;
  const seccion = await prisma.seccionRiego.findUnique({ where: { id: seccionId } });
  if (!seccion || seccion.huertaId !== alcance) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return false;
  }
  return true;
}

riegoRouter.get("/:seccionId/historial", requirePermission("riego", "ver"), async (req, res) => {
  const seccionId = unoSolo(req.params.seccionId);
  if (!(await verificarAlcanceSeccion(req, res, seccionId))) return;
  res.json(await historialRiego(seccionId));
});

riegoRouter.get("/:seccionId/:fecha", requirePermission("riego", "ver"), async (req, res) => {
  const seccionId = unoSolo(req.params.seccionId);
  const fecha = unoSolo(req.params.fecha);
  if (!(await verificarAlcanceSeccion(req, res, seccionId))) return;
  const [registro, fertirriegoActivo] = await Promise.all([
    obtenerRiegoDiario(seccionId, fecha),
    fertirriegoActivoDeSeccion(seccionId, fecha),
  ]);
  res.json({ registro, fertirriegoActivo });
});

const registrarSchema = z.object({
  horas: z.number().nonnegative(),
  fertirriegoConfirmado: z.boolean(),
  cantidadAplicada: z.number().positive().optional(),
});

riegoRouter.post("/:seccionId/:fecha", requirePermission("riego", "capturar"), async (req, res) => {
  const seccionId = unoSolo(req.params.seccionId);
  const fecha = unoSolo(req.params.fecha);
  if (!(await verificarAlcanceSeccion(req, res, seccionId))) return;

  const parsed = registrarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const registro = await registrarRiegoDiario(seccionId, fecha, parsed.data, req.usuario!.usuarioId);
    res.status(201).json(registro);
  } catch (err) {
    if (err instanceof FertirriegoNoActivoError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
