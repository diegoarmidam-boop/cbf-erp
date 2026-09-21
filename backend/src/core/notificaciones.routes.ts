import { Router } from "express";
import { z } from "zod";
import { requireAuth, huertaIdDeAlcance } from "../middleware/auth.js";
import { mensajeErrorCaptura, mensajeErrorValidacion } from "./http.js";
import { AlertaNoInformativaError, historialNotificaciones, marcarNotificacionVista, obtenerNotificaciones } from "./notificaciones.js";

export const notificacionesRouter = Router();
notificacionesRouter.use(requireAuth);

// Hub central (bloque 6, antes "Solicitudes"): agrega todo lo pendiente de
// atención — propone/autoriza, órdenes por autorizar, CxP próximas a
// vencer, vencimientos de 15 días (Aplicaciones/Fertilizantes), descuadres
// de Almacén Local, y días de Nómina pendientes de cerrar — filtrado por
// lo que el rol del usuario puede ver/autorizar en cada módulo.
notificacionesRouter.get("/", async (req, res) => {
  res.json(await obtenerNotificaciones(req.usuario!.rol, huertaIdDeAlcance(req), req.usuario!.usuarioId));
});

// Historial de alertas informativas ya vistas (V1 P6). Registrada ANTES de
// las rutas con parámetro.
notificacionesRouter.get("/historial", async (req, res) => {
  res.json(await historialNotificaciones(req.usuario!.usuarioId));
});

const vistaSchema = z.object({ id: z.string().min(1) });

notificacionesRouter.post("/vista", async (req, res) => {
  const parsed = vistaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: mensajeErrorValidacion(parsed.error) });
    return;
  }
  try {
    res.status(201).json(await marcarNotificacionVista(parsed.data.id, req.usuario!.rol, huertaIdDeAlcance(req), req.usuario!.usuarioId));
  } catch (err) {
    res.status(err instanceof AlertaNoInformativaError ? 409 : 400).json({ error: mensajeErrorCaptura(err) });
  }
});
