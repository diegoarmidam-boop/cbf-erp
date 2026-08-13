import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import { prisma } from "../../core/db.js";
import {
  estadoRiegoTodasUPs,
  fertirriegoActivoDeSeccion,
  FertirriegoNoActivoError,
  historialRiego,
  historialSemanal,
  MotivoNoAplicadoRequeridoError,
  obtenerRiegoDiario,
  registrarRiegoDiario,
} from "./riego.js";

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

// Vista "Todas UPs" (9.6) — antes de "/:seccionId/..." para no ser interpretado como un seccionId literal.
riegoRouter.get("/todas-ups/:fecha", requirePermission("riego", "ver"), async (req, res) => {
  const fecha = unoSolo(req.params.fecha);
  const alcance = huertaIdDeAlcance(req);
  res.json(await estadoRiegoTodasUPs(fecha, alcance ?? undefined));
});

riegoRouter.get("/historial-semanal/:huertaId/:fechaRef", requirePermission("riego", "ver"), async (req, res) => {
  const huertaId = unoSolo(req.params.huertaId);
  const alcance = huertaIdDeAlcance(req);
  if (alcance && alcance !== huertaId) {
    res.status(403).json({ error: "Tu acceso está restringido a tu propia Huerta." });
    return;
  }
  res.json(await historialSemanal(huertaId, unoSolo(req.params.fechaRef)));
});

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

const cantidadProductoSchema = z.object({
  productoId: z.string().min(1),
  cantidadAplicada: z.number().positive(),
});

const registrarSchema = z.object({
  horas: z.number().nonnegative(),
  fertirriegoConfirmado: z.boolean(),
  cantidadesAplicadas: z.array(cantidadProductoSchema).optional(),
  motivoNoAplicado: z.string().optional(),
});

riegoRouter.post("/:seccionId/:fecha", requirePermission("riego", "capturar"), async (req, res) => {
  const seccionId = unoSolo(req.params.seccionId);
  const fecha = unoSolo(req.params.fecha);
  if (!(await verificarAlcanceSeccion(req, res, seccionId))) return;

  const parsed = registrarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const registro = await registrarRiegoDiario(seccionId, fecha, parsed.data, req.usuario!.usuarioId);
    res.status(201).json(registro);
  } catch (err) {
    if (err instanceof FertirriegoNoActivoError || err instanceof MotivoNoAplicadoRequeridoError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
