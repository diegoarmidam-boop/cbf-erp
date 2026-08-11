import { Router } from "express";
import { requireAuth, huertaIdDeAlcance } from "../middleware/auth.js";
import { obtenerNotificaciones } from "./notificaciones.js";

export const notificacionesRouter = Router();
notificacionesRouter.use(requireAuth);

// Hub central (bloque 6, antes "Solicitudes"): agrega todo lo pendiente de
// atención — propone/autoriza, órdenes por autorizar, CxP próximas a
// vencer, vencimientos de 15 días (Aplicaciones/Fertilizantes), descuadres
// de Almacén Local, y días de Nómina pendientes de cerrar — filtrado por
// lo que el rol del usuario puede ver/autorizar en cada módulo.
notificacionesRouter.get("/", async (req, res) => {
  res.json(await obtenerNotificaciones(req.usuario!.rol, huertaIdDeAlcance(req)));
});
