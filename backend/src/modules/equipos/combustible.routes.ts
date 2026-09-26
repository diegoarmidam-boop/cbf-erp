import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { mensajeErrorCaptura, mensajeErrorValidacion, unoSolo } from "../../core/http.js";
import {
  calcularAlertaLitrosPorHectarea,
  calcularAlertaRendimiento,
  historialCargas,
  OdometroRetrocedeError,
  registrarCarga,
  surtirGarrafa,
} from "./combustible.js";
import { StockInsuficienteError } from "../almacen/movimientos.js";

export const combustibleRouter = Router();
combustibleRouter.use(requireAuth);

combustibleRouter.get("/:equipoId", requirePermission("equipos", "ver"), async (req, res) => {
  res.json(await historialCargas(unoSolo(req.params.equipoId)));
});

combustibleRouter.get("/:equipoId/alerta-rendimiento", requirePermission("equipos", "ver"), async (req, res) => {
  res.json(await calcularAlertaRendimiento(unoSolo(req.params.equipoId)));
});

combustibleRouter.get("/:equipoId/alerta-litros-por-hectarea", requirePermission("equipos", "ver"), async (req, res) => {
  res.json(await calcularAlertaLitrosPorHectarea(unoSolo(req.params.equipoId)));
});

const cargaSchema = z.object({
  fecha: z.string(),
  tipo: z.enum(["diesel_garrafa", "gasolina_garrafa", "gasolina_externa", "diesel_externo"]),
  odometro: z.number().nonnegative().optional(),
  horometro: z.number().nonnegative().optional(),
  litros: z.number().positive(),
  precioUnitario: z.number().nonnegative().optional(),
  productoId: z.string().optional(),
  huertaId: z.string().optional(),
  fotoUrl: z.string().optional(),
});

combustibleRouter.post("/:equipoId", requirePermission("equipos", "capturar"), async (req, res) => {
  const parsed = cargaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const carga = await registrarCarga(unoSolo(req.params.equipoId), parsed.data, req.usuario!.usuarioId);
    res.status(201).json(carga);
  } catch (err) {
    if (err instanceof OdometroRetrocedeError) {
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

// Bodega surte la garrafa de una Huerta (V1 P3, 26-sep-2026, 9.13a) — mismo
// endpoint conceptual que "Entregar a Huerta" de Almacén, expuesto también
// aquí por conveniencia desde la pantalla de Combustible.
const surtirSchema = z.object({
  productoId: z.string().min(1),
  huertaId: z.string().min(1),
  litros: z.number().positive(),
});

combustibleRouter.post("/surtir-garrafa", requirePermission("almacen", "capturar"), async (req, res) => {
  const parsed = surtirSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    const local = await surtirGarrafa(parsed.data.productoId, parsed.data.huertaId, parsed.data.litros, req.usuario!.usuarioId);
    res.status(201).json(local);
  } catch (err) {
    if (err instanceof StockInsuficienteError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
