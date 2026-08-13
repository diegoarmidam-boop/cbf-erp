import { Router } from "express";
import { z } from "zod";
import { mensajeErrorValidacion } from "../../core/http.js";
import { requireAuth, requirePermission, huertaIdDeAlcance } from "../../middleware/auth.js";
import { tienePermiso } from "../../core/permissions.js";
import {
  CapturaInvalidaError,
  DiaCerradoError,
  guardarCapturaDelDia,
  obtenerCapturaDelDia,
  obtenerCapturaTodasUPs,
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

// Vista "Todas UPs" (9.11) — antes de "/:huertaId/:fecha" para no ser interpretado como un huertaId literal "todas-ups".
capturaRouter.get("/todas-ups/:fecha", requirePermission("nomina", "capturar"), async (req, res) => {
  const alcance = huertaIdDeAlcance(req);
  res.json(await obtenerCapturaTodasUPs(req.params.fecha as string, alcance));
});

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
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }

  try {
    // Edición después de cerrado (9.11): solo Director General, RH,
    // Encargado de Nóminas y Gerente Administrativo (mismo grupo que ya
    // tiene "editar" en la matriz de este módulo) — el Supervisor sigue
    // topado por el candado normal de día cerrado.
    const cerrado = await diaEstaCerrado(huertaId, fecha);
    const puedeEditarCerrado = cerrado && (await tienePermiso(req.usuario!.rol, "nomina", "editar"));
    await guardarCapturaDelDia(huertaId, fecha, parsed.data.filas, req.usuario!.usuarioId, { permitirDiaCerrado: puedeEditarCerrado });
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
