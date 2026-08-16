import { Router } from "express";
import { configRouter } from "./config.routes.js";
import { gruposRouter } from "./grupos.routes.js";
import { capturaRouter } from "./captura.routes.js";
import { cierreRouter } from "./cierre.routes.js";
import { prestamosRouter } from "./prestamos.routes.js";
import { bonosRouter } from "./bonos.routes.js";
import { asistenciaRouter } from "./asistencia.routes.js";
import { reporteRouter } from "./reporte.routes.js";
import { liquidacionesRouter } from "./liquidaciones.routes.js";

export const nominaRouter = Router();

// El catálogo de Actividades se movió a /api/actividades/definiciones
// (9.4, 15-ago-2026) — antes vivía aquí porque el módulo de Actividades se
// construyó después. Ver backend/src/modules/actividades/catalogo.routes.ts.
nominaRouter.use("/config", configRouter);
nominaRouter.use("/grupos", gruposRouter);
nominaRouter.use("/captura", capturaRouter);
nominaRouter.use("/cierre", cierreRouter);
nominaRouter.use("/prestamos", prestamosRouter);
nominaRouter.use("/bonos", bonosRouter);
nominaRouter.use("/asistencia", asistenciaRouter);
nominaRouter.use("/reporte", reporteRouter);
nominaRouter.use("/liquidaciones", liquidacionesRouter);
